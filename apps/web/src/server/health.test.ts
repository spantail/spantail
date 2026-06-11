import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("responds with ok on /api/health", async () => {
	const res = await exports.default.fetch(
		new Request("https://example.com/api/health"),
	);

	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ status: "ok" });
});
