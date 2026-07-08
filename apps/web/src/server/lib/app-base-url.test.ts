import { describe, expect, it } from "vitest";

import { appBaseUrl } from "./app-base-url";

const req = (url: string) => new Request(url);

describe("appBaseUrl", () => {
	it("uses BETTER_AUTH_URL when set, stripping a trailing slash", () => {
		expect(
			appBaseUrl(
				{ BETTER_AUTH_URL: "https://spantail.example.com/" },
				req("https://ignored.workers.dev/api/auth/x"),
			),
		).toBe("https://spantail.example.com");
	});

	it("prefers BETTER_AUTH_URL over the request origin", () => {
		expect(
			appBaseUrl(
				{ BETTER_AUTH_URL: "https://canonical.example.com" },
				req("https://request-origin.workers.dev/x"),
			),
		).toBe("https://canonical.example.com");
	});

	it("falls back to the request origin when BETTER_AUTH_URL is unset", () => {
		expect(
			appBaseUrl({}, req("https://my-instance.workers.dev/invite/tok")),
		).toBe("https://my-instance.workers.dev");
	});

	it("treats a blank BETTER_AUTH_URL as unset", () => {
		expect(
			appBaseUrl(
				{ BETTER_AUTH_URL: "   " },
				req("https://fresh.workers.dev/x"),
			),
		).toBe("https://fresh.workers.dev");
	});

	it("throws when neither a configured origin nor a request is available", () => {
		expect(() => appBaseUrl({}, undefined)).toThrow(/base URL/);
	});
});
