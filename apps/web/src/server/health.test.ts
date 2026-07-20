import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("responds with ok on /api/health", async () => {
	const res = await exports.default.fetch(
		new Request("https://example.com/api/health"),
	);

	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ status: "ok" });
});

// A trailing slash on a configured base URL (e.g. the plugin's apiUrl) doubles
// the slash in request paths ("…//api/health"); the entry normalizer collapses
// it so the route still matches instead of 404ing.
it("routes a path with a doubled slash", async () => {
	const res = await exports.default.fetch(
		new Request("https://example.com//api/health"),
	);

	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ status: "ok" });
});

// The reported failure is the POST telemetry hooks. A doubled-slash POST must
// route to the same place as the single-slash form (method and path preserved
// across the reconstruction) — same status, and not a routing 404.
it("routes a doubled-slash POST like the single-slash form", async () => {
	const post = (path: string) =>
		exports.default.fetch(
			new Request(`https://example.com${path}`, { method: "POST" }),
		);

	const doubled = await post("//api/v1/agent-events");
	const single = await post("/api/v1/agent-events");

	expect(doubled.status).not.toBe(404);
	expect(doubled.status).toBe(single.status);
});
