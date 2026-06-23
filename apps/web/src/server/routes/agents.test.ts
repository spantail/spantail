import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

/** The first user is the instance admin; turn the agents feature on. */
async function enableAgents(adminCookie: string): Promise<void> {
	await apiJson(
		"PATCH",
		"/api/v1/instance/agents",
		{ agentsEnabled: true },
		adminCookie,
	);
}

it("registers agents and issues access tokens via sessions only", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");
	await enableAgents(cookie);

	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "My CC" },
			cookie,
		)
	).json()) as { id: string; userId?: string };
	expect(agent.userId).toBeUndefined();

	const created = await apiJson(
		"POST",
		`/api/v1/agents/${agent.id}/tokens`,
		{ name: "laptop", expiresInDays: 30 },
		cookie,
	);
	expect(created.status).toBe(201);
	const body = (await created.json()) as { token: string; tokenHash?: string };
	expect(body.token).toMatch(/^toxil_aat_/);
	expect(body.tokenHash).toBeUndefined();

	// Listing never reveals the hash.
	const tokens = (await (
		await apiGet(`/api/v1/agents/${agent.id}/tokens`, cookie)
	).json()) as Array<{ tokenHash?: string }>;
	expect(tokens).toHaveLength(1);
	expect(tokens[0]?.tokenHash).toBeUndefined();

	// Archiving the agent kills its tokens (the agent can't be un-archived).
	const archived = await apiJson(
		"DELETE",
		`/api/v1/agents/${agent.id}`,
		undefined,
		cookie,
	);
	expect(archived.status).toBe(204);
	const denied = await appFetch("/api/v1/agent-entries", {
		method: "POST",
		headers: {
			authorization: `Bearer ${body.token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ sessionId: "s", durationMinutes: 1 }),
	});
	expect(denied.status).toBe(401);

	// Archived agents drop out of the registry listing.
	const listed = (await (
		await apiGet("/api/v1/agents", cookie)
	).json()) as unknown[];
	expect(listed).toHaveLength(0);
});

it("cannot manage another user's agent", async () => {
	const alice = await signUpUser("Alice", "alice@example.com");
	const bob = await signUpUser("Bob", "bob@example.com");
	await enableAgents(alice);
	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "codex", name: "Codex" },
			alice,
		)
	).json()) as { id: string };

	const tokenDenied = await apiJson(
		"POST",
		`/api/v1/agents/${agent.id}/tokens`,
		{ name: "x" },
		bob,
	);
	expect(tokenDenied.status).toBe(404);

	const deleteDenied = await apiJson(
		"DELETE",
		`/api/v1/agents/${agent.id}`,
		undefined,
		bob,
	);
	expect(deleteDenied.status).toBe(404);
});
