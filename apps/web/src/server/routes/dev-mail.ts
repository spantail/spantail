import { Hono } from "hono";

import { getOutbox } from "../lib/mail/mailer";
import type { AppEnv } from "../types";

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function extractLinks(html: string): string[] {
	const links = new Set<string>();
	for (const match of html.matchAll(/href="([^"]+)"/g)) {
		if (match[1]) links.add(match[1]);
	}
	return [...links];
}

/**
 * Development-only outbox viewer: shows captured emails and their links so a
 * developer can read the body and follow the real invitation link without a
 * mail provider. Returns 404 in production.
 */
export const devMailRoutes = new Hono<AppEnv>().get("/", (c) => {
	if (c.env.APP_ENV === "production") {
		return c.json({ error: { code: "not_found", message: "Not found" } }, 404);
	}

	const entries = getOutbox();
	const sections =
		entries.length === 0
			? "<p>No emails captured yet.</p>"
			: entries
					.map((entry) => {
						const links = extractLinks(entry.html)
							.map(
								(href) =>
									`<li><a href="${escapeHtml(href)}">${escapeHtml(href)}</a></li>`,
							)
							.join("");
						return `<article style="margin:16px 0;padding:16px;border:1px solid #ddd;border-radius:8px">
		<div><strong>${escapeHtml(entry.subject)}</strong></div>
		<div style="color:#666;font-size:13px">to: ${escapeHtml(entry.to)} · ${escapeHtml(entry.sentAt)}</div>
		${links ? `<ul>${links}</ul>` : ""}
		<iframe title="email" srcdoc="${escapeHtml(entry.html)}" style="width:100%;height:360px;border:1px solid #eee;margin-top:8px"></iframe>
	</article>`;
					})
					.join("");

	return c.html(
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dev outbox</title></head>
<body style="font-family:sans-serif;max-width:680px;margin:24px auto;padding:0 16px">
<h1>Dev outbox</h1>
<p style="color:#666">Captured ${entries.length} email(s). In-memory; cleared on worker restart.</p>
${sections}
</body></html>`,
	);
});
