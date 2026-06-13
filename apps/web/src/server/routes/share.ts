import { isShareTokenFormat, verifySharePasscode } from "@toxil/core";
import { getShareViewByToken, recordShareView } from "@toxil/db";
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

type ShareView = NonNullable<Awaited<ReturnType<typeof getShareViewByToken>>>;

/**
 * Resolves the token to a viewable share. Malformed, unknown, revoked, and
 * expired links all collapse to null so the public 404 page never reveals
 * whether a link once existed.
 */
async function loadUsableShare(c: Context<AppEnv>): Promise<ShareView | null> {
	const token = c.req.param("token") ?? "";
	if (!isShareTokenFormat(token)) return null;
	const view = await getShareViewByToken(c.var.db, token);
	if (!view) return null;
	if (view.share.revokedAt) return null;
	if (view.share.expiresAt && view.share.expiresAt.getTime() < Date.now()) {
		return null;
	}
	return view;
}

async function respondWithContent(c: Context<AppEnv>, view: ShareView) {
	// hono re-dispatches HEAD requests to the GET handler; link unfurlers
	// probing the URL must not inflate the view count. Counting is awaited
	// inline (not waitUntil) so the count is durable when the response lands.
	if (c.req.method !== "HEAD") {
		await recordShareView(c.var.db, view.share.id);
	}
	return c.html(
		renderSharePage({
			locale: pickShareLocale(c),
			reportName: view.reportName,
			dateRange: view.resolvedFilters.dateRange,
			contentHtml: await renderMarkdownToHtml(view.renderedMarkdown),
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
		const view = await loadUsableShare(c);
		if (!view) return c.html(renderNotFoundPage(pickShareLocale(c)), 404);
		if (view.share.passcodeHash) {
			return c.html(renderPasscodePage({ locale: pickShareLocale(c) }));
		}
		return respondWithContent(c, view);
	})
	.post("/:token", async (c) => {
		const view = await loadUsableShare(c);
		if (!view) return c.html(renderNotFoundPage(pickShareLocale(c)), 404);
		if (view.share.passcodeHash) {
			const form = await c.req.parseBody();
			const passcode = typeof form.passcode === "string" ? form.passcode : "";
			if (!(await verifySharePasscode(passcode, view.share.passcodeHash))) {
				return c.html(
					renderPasscodePage({ locale: pickShareLocale(c), error: true }),
					401,
				);
			}
		}
		return respondWithContent(c, view);
	})
	// A sub-app's notFound handler is ignored when mounted via app.route, so
	// stray paths and methods get the HTML 404 (not the API's JSON envelope)
	// through this explicit catch-all.
	.all("*", (c) => c.html(renderNotFoundPage(pickShareLocale(c)), 404));
