import { SpantailClient } from "@spantail/sdk";

import { recordServerVersion } from "./server-version";

/** API client for the same-origin Worker; session cookies ride along. */
export const api = new SpantailClient({
	baseUrl: window.location.origin,
	// Capture the instance version the Worker stamps on every response, so the
	// reload banner can detect an out-of-date bundle without any extra request.
	fetch: async (input, init) => {
		const res = await fetch(input, init);
		const version = res.headers.get("x-spantail-version");
		if (version) recordServerVersion(version);
		return res;
	},
});
