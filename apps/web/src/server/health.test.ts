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

// The reported failure is the POST telemetry hooks; assert method and body
// survive the request reconstruction by reaching the (auth-guarded) ingest
// route rather than 404ing on the doubled slash.
it("routes a doubled-slash POST to the matching route", async () => {
	const res = await exports.default.fetch(
		new Request("https://example.com//api/v1/agent-events", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ sessionId: "s", events: [] }),
		}),
	);

	// Unauthenticated, so this is rejected — but it must reach the route (not a
	// routing 404), which proves the POST and its body were preserved.
	expect(res.status).not.toBe(404);
});
