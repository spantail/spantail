import { SpantailClient } from "@spantail/sdk";

import i18n from "@/i18n";
import { recordServerVersion } from "./server-version";

/** API client for the same-origin Worker; session cookies ride along. */
export const api = new SpantailClient({
	baseUrl: window.location.origin,
	// Capture the instance version the Worker stamps on every response, so the
	// reload banner can detect an out-of-date bundle without any extra request.
	fetch: async (input, init) => {
		// Send the app's active language (a localStorage override, else the
		// navigator default) so the server localizes responses — e.g. report date
		// formatting — to the UI language rather than the raw browser
		// Accept-Language header.
		const headers = new Headers(init?.headers);
		headers.set("Accept-Language", i18n.resolvedLanguage ?? i18n.language);
		const res = await fetch(input, { ...init, headers });
		const version = res.headers.get("x-spantail-version");
		if (version) recordServerVersion(version);
		return res;
	},
});
