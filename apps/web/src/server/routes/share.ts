import {
	isShareTokenFormat,
	splitFrontMatter,
	verifySharePasscode,
} from "@toxil/core";
import type { ReportShareRow } from "@toxil/db";
import { getReportShareByToken, recordShareView } from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { renderMarkdownToHtml } from "../lib/markdown";
import {
	pickShareLocale,
	renderNotFoundPage,
	renderPasscodePage,
	renderSharePage,
} from "../lib/share-page";
import type { AppEnv } from "../types";

/**
 * Resolves the token to a viewable share. Malformed, unknown, revoked, and
 * expired links all collapse to null so the public 404 page never reveals
 * whether a link once existed.
 */
async function loadUsableShare(
	c: Context<AppEnv>,
): Promise<ReportShareRow | null> {
	const token = c.req.param("token") ?? "";
	if (!isShareTokenFormat(token)) return null;
	const share = await getReportShareByToken(c.var.db, token);
	if (!share) return null;
	if (share.revokedAt) return null;
	if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
		return null;
	}
	return share;
}

async function respondWithContent(c: Context<AppEnv>, share: ReportShareRow) {
	// The body is the copy frozen onto the share row at mint time, so later
	// report edits never change a published page.
	// hono re-dispatches HEAD requests to the GET handler; link unfurlers
	// probing the URL must not inflate the view count. Counting is awaited
	// inline (not waitUntil) so the count is durable when the response lands.
	if (c.req.method !== "HEAD") {
		await recordShareView(c.var.db, share.id);
	}
	return c.html(
		renderSharePage({
			locale: pickShareLocale(c),
			reportName: share.reportName,
			dateRange: { from: share.dateFrom, to: share.dateTo },
			// Hide the system YAML front-matter header on the public page.
			contentHtml: await renderMarkdownToHtml(
				splitFrontMatter(share.renderedMarkdown).body,
			),
		}),
	);
}

export const shareRoutes = new Hono<AppEnv>()
	// Share pages are public but private in nature: keep them out of search
	// indexes and caches, and lock down everything but inline styles and
	// markdown images (no-referrer keeps tokens away from image hosts).
	.use("*", async (c, next) => {
		await next();
		c.res.headers.set("X-Robots-Tag", "noindex");
		c.res.headers.set("Cache-Control", "no-store");
		c.res.headers.set("Referrer-Policy", "no-referrer");
		c.res.headers.set("X-Content-Type-Options", "nosniff");
		c.res.headers.set(
			"Content-Security-Policy",
			"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; form-action 'self'; base-uri 'none'",
		);
	})
	.get("/:token", async (c) => {
		const share = await loadUsableShare(c);
		if (!share) return c.html(renderNotFoundPage(pickShareLocale(c)), 404);
		if (share.passcodeHash) {
			return c.html(renderPasscodePage({ locale: pickShareLocale(c) }));
		}
		return respondWithContent(c, share);
	})
	.post("/:token", async (c) => {
		const share = await loadUsableShare(c);
		if (!share) return c.html(renderNotFoundPage(pickShareLocale(c)), 404);
		if (share.passcodeHash) {
			const form = await c.req.parseBody();
			const passcode = typeof form.passcode === "string" ? form.passcode : "";
			if (!(await verifySharePasscode(passcode, share.passcodeHash))) {
				return c.html(
					renderPasscodePage({ locale: pickShareLocale(c), error: true }),
					401,
				);
			}
		}
		return respondWithContent(c, share);
	})
	// A sub-app's notFound handler is ignored when mounted via app.route, so
	// stray paths and methods get the HTML 404 (not the API's JSON envelope)
	// through this explicit catch-all.
	.all("*", (c) => c.html(renderNotFoundPage(pickShareLocale(c)), 404));
