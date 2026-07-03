import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

it("keeps realtime off by default and refuses the stream", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");

	// Off by default.
	const enabled = (await (
		await apiGet("/api/v1/instance/realtime-enabled", admin)
	).json()) as { enabled: boolean };
	expect(enabled.enabled).toBe(false);

	// While off, the stream endpoint refuses even a valid session.
	const blocked = await appFetch("/api/v1/realtime", {
		headers: { cookie: admin },
	});
	expect(blocked.status).toBe(403);
	await blocked.body?.cancel();
});

it("lets an instance admin toggle realtime on, opening the stream", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");

	const updated = (await (
		await apiJson(
			"PATCH",
			"/api/v1/instance/realtime",
			{ realtimeEnabled: true },
			admin,
		)
	).json()) as { enabled: boolean };
	expect(updated.enabled).toBe(true);

	const res = await appFetch("/api/v1/realtime", {
		headers: { cookie: admin },
	});
	expect(res.status).toBe(200);
	expect(res.headers.get("content-type")).toContain("text/event-stream");
	await res.body?.cancel();
});

it("does not let a non-admin toggle realtime", async () => {
	// The first user is the instance admin; the member is a regular user.
	await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");

	const denied = await apiJson(
		"PATCH",
		"/api/v1/instance/realtime",
		{ realtimeEnabled: true },
		member,
	);
	expect(denied.status).toBe(403);

	// The reader endpoint stays accessible (it only reports the boolean).
	const readable = await appFetch("/api/v1/instance/realtime-enabled");
	expect(readable.status).toBe(200);
});
