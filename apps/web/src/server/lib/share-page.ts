import type { Context } from "hono";
import { accepts } from "hono/accepts";
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

export type ShareLocale = "en" | "ja";

// Share pages are server-rendered for unauthenticated recipients, so they
// cannot use the SPA's react-i18next catalogs. This tiny server-side catalog
// keeps the en/ja rule for the page chrome.
const MESSAGES: Record<
	ShareLocale,
	{
		notFoundTitle: string;
		notFoundBody: string;
		passcodeTitle: string;
		passcodeLabel: string;
		passcodeSubmit: string;
		passcodeIncorrect: string;
		footer: string;
	}
> = {
	en: {
		notFoundTitle: "Link not available",
		notFoundBody: "This share link is invalid or has expired.",
		passcodeTitle: "Passcode required",
		passcodeLabel: "Passcode",
		passcodeSubmit: "View report",
		passcodeIncorrect: "Incorrect passcode.",
		footer: "Shared via Spantail",
	},
	ja: {
		notFoundTitle: "リンクが無効です",
		notFoundBody: "この共有リンクは無効か、期限切れです。",
		passcodeTitle: "パスコードが必要です",
		passcodeLabel: "パスコード",
		passcodeSubmit: "レポートを表示",
		passcodeIncorrect: "パスコードが正しくありません。",
		footer: "Spantail で共有",
	},
};

export function pickShareLocale(c: Context): ShareLocale {
	return accepts(c, {
		header: "Accept-Language",
		supports: ["en", "ja"],
		default: "en",
	}) as ShareLocale;
}

/**
 * Narrows a raw `Accept-Language` header to a supported locale. Used where only
 * the header string is available (no Hono Context), e.g. the better-auth
 * user-create hook seeding a default template. Missing/unknown header → "en".
 */
export function negotiateLocale(
	acceptLanguage: string | null | undefined,
): ShareLocale {
	if (!acceptLanguage) return "en";
	const ranked = acceptLanguage
		.split(",")
		.map((part) => {
			const [tag = "", ...params] = part.trim().split(";");
			const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
			const quality = q ? Number.parseFloat(q.slice(2)) : 1;
			return {
				tag: tag.trim().toLowerCase(),
				quality: Number.isNaN(quality) ? 0 : quality,
			};
		})
		.sort((a, b) => b.quality - a.quality);
	for (const { tag } of ranked) {
		if (tag === "ja" || tag.startsWith("ja-")) return "ja";
		if (tag === "en" || tag.startsWith("en-")) return "en";
	}
	return "en";
}

// Standalone styling on purpose: share pages are served outside the SPA and
// must not pull in the app shell or its CSS bundle.
const STYLE = `
:root { color-scheme: light dark; }
body {
	font-family: ui-sans-serif, system-ui, sans-serif;
	line-height: 1.6;
	max-width: 42rem;
	margin: 0 auto;
	padding: 2rem 1rem 4rem;
}
header { border-bottom: 1px solid rgba(128, 128, 128, 0.4); margin-bottom: 1.5rem; }
header h1 { margin-bottom: 0.25rem; }
header p { margin-top: 0; color: rgba(128, 128, 128, 0.9); }
table { border-collapse: collapse; }
th, td { border: 1px solid rgba(128, 128, 128, 0.5); padding: 0.3rem 0.6rem; }
pre, code { background: rgba(128, 128, 128, 0.15); }
pre { padding: 0.75rem; overflow-x: auto; }
form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 20rem; }
input, button { font: inherit; padding: 0.4rem 0.6rem; }
.error { color: #b91c1c; }
footer { margin-top: 3rem; font-size: 0.8rem; color: rgba(128, 128, 128, 0.9); }
`;

function layout(
	locale: ShareLocale,
	title: string,
	body: HtmlEscapedString | Promise<HtmlEscapedString>,
): HtmlEscapedString | Promise<HtmlEscapedString> {
	return html`<!doctype html>
<html lang="${locale}">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="robots" content="noindex" />
		<title>${title}</title>
		<style>${raw(STYLE)}</style>
	</head>
	<body>
		${body}
		<footer>${MESSAGES[locale].footer}</footer>
	</body>
</html>`;
}

export function renderSharePage(options: {
	locale: ShareLocale;
	reportName: string;
	dateRange: { from: string; to: string };
	contentHtml: string;
}) {
	const { locale, reportName, dateRange, contentHtml } = options;
	return layout(
		locale,
		reportName,
		html`<header>
			<h1>${reportName}</h1>
			<p>${dateRange.from} – ${dateRange.to}</p>
		</header>
		<main>${raw(contentHtml)}</main>`,
	);
}

export function renderPasscodePage(options: {
	locale: ShareLocale;
	error?: boolean;
}) {
	const messages = MESSAGES[options.locale];
	return layout(
		options.locale,
		messages.passcodeTitle,
		html`<main>
			<h1>${messages.passcodeTitle}</h1>
			${options.error ? html`<p class="error">${messages.passcodeIncorrect}</p>` : ""}
			<form method="post">
				<label for="passcode">${messages.passcodeLabel}</label>
				<input id="passcode" name="passcode" type="password" autofocus required />
				<button type="submit">${messages.passcodeSubmit}</button>
			</form>
		</main>`,
	);
}

export function renderNotFoundPage(locale: ShareLocale) {
	const messages = MESSAGES[locale];
	return layout(
		locale,
		messages.notFoundTitle,
		html`<main>
			<h1>${messages.notFoundTitle}</h1>
			<p>${messages.notFoundBody}</p>
		</main>`,
	);
}
