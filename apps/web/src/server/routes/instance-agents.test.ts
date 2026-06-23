import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

it("keeps the agents feature off by default and gates its endpoints", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");

	// Off by default.
	const enabled = (await (
		await apiGet("/api/v1/instance/agents-enabled", admin)
	).json()) as { enabled: boolean };
	expect(enabled.enabled).toBe(false);

	// While off, the agents endpoints are dark.
	const blocked = await apiJson(
		"POST",
		"/api/v1/agents",
		{ type: "claude_code", name: "CC" },
		admin,
	);
	expect(blocked.status).toBe(403);
});

it("lets an instance admin toggle the feature on, ungating the endpoints", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");

	const updated = (await (
		await apiJson(
			"PATCH",
			"/api/v1/instance/agents",
			{ agentsEnabled: true },
			admin,
		)
	).json()) as { enabled: boolean };
	expect(updated.enabled).toBe(true);

	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			admin,
		)
	).json()) as { id: string };
	const created = await apiJson(
		"POST",
		"/api/v1/agents",
		{ type: "claude_code", name: "CC", defaultWorkspaceId: ws.id },
		admin,
	);
	expect(created.status).toBe(201);
});

it("does not let a non-admin toggle the feature", async () => {
	// The first user is the instance admin; the member is a regular user.
	await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");

	const denied = await apiJson(
		"PATCH",
		"/api/v1/instance/agents",
		{ agentsEnabled: true },
		member,
	);
	expect(denied.status).toBe(403);

	// The reader endpoint stays accessible (it only reports the boolean).
	const readable = await appFetch("/api/v1/instance/agents-enabled");
	expect(readable.status).toBe(200);
});
