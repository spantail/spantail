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

async function createWorkspace(cookie: string, slug: string): Promise<string> {
	const ws = (await (
		await apiJson("POST", "/api/v1/workspaces", { slug, name: slug }, cookie)
	).json()) as { id: string };
	return ws.id;
}

function ingest(
	token: string,
	sessionId: string,
	workspaceId?: string,
): Promise<Response> {
	return appFetch("/api/v1/agent-entries", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ sessionId, durationMinutes: 1, workspaceId }),
	});
}

it("registers an agent with its access token in one step", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");
	await enableAgents(cookie);
	const wsId = await createWorkspace(cookie, "acme");

	const created = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "My CC" },
			cookie,
		)
	).json()) as {
		id: string;
		userId?: string;
		secret: string;
		token: { lastUsedAt: string | null; tokenHash?: string };
	};
	expect(created.userId).toBeUndefined();
	expect(created.secret).toMatch(/^spantail_aat_/);
	expect(created.token.lastUsedAt).toBeNull();
	expect(created.token.tokenHash).toBeUndefined();

	// The list embeds the token summary and never leaks the hash/secret.
	const list = (await (
		await apiGet("/api/v1/agents", cookie)
	).json()) as Array<{
		id: string;
		disabledAt: string | null;
		token: { lastUsedAt: string | null };
		secret?: string;
	}>;
	expect(list).toHaveLength(1);
	expect(list[0]?.disabledAt).toBeNull();
	expect(list[0]?.secret).toBeUndefined();

	// The issued secret can ingest immediately into any workspace the owner
	// belongs to (named per payload — agents carry no binding).
	expect((await ingest(created.secret, "s1", wsId)).status).toBe(200);

	// Archiving the agent kills its token and drops it from the registry.
	const archived = await apiJson(
		"DELETE",
		`/api/v1/agents/${created.id}`,
		undefined,
		cookie,
	);
	expect(archived.status).toBe(204);
	expect((await ingest(created.secret, "s2", wsId)).status).toBe(401);
	expect(
		((await (await apiGet("/api/v1/agents", cookie)).json()) as unknown[])
			.length,
	).toBe(0);
});

it("rejects ingest that names no workspace", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");
	await enableAgents(cookie);
	const wsId = await createWorkspace(cookie, "acme");
	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "CC" },
			cookie,
		)
	).json()) as { secret: string };

	// No fallback exists: a payload without a workspaceId (an unlinked
	// repository) is rejected instead of landing anywhere by default.
	const missing = await ingest(agent.secret, "s1");
	expect(missing.status).toBe(400);

	// A workspace the owner cannot address is rejected without leaking whether
	// it exists. (Losing membership mid-life is covered in agent-entries tests.)
	expect((await ingest(agent.secret, "s2", "no-such-ws")).status).toBe(403);

	// An explicit workspace the owner belongs to works.
	expect((await ingest(agent.secret, "s3", wsId)).status).toBe(200);
});

it("disables and re-enables an agent, gating ingest", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");
	await enableAgents(cookie);
	const wsId = await createWorkspace(cookie, "acme");
	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "CC" },
			cookie,
		)
	).json()) as { id: string; secret: string };

	const disabled = await apiJson(
		"PATCH",
		`/api/v1/agents/${agent.id}`,
		{ disabled: true },
		cookie,
	);
	expect(disabled.status).toBe(200);
	expect(
		((await disabled.json()) as { disabledAt: string }).disabledAt,
	).not.toBeNull();
	expect((await ingest(agent.secret, "s1", wsId)).status).toBe(401);

	const enabled = await apiJson(
		"PATCH",
		`/api/v1/agents/${agent.id}`,
		{ disabled: false },
		cookie,
	);
	expect(
		((await enabled.json()) as { disabledAt: null }).disabledAt,
	).toBeNull();
	expect((await ingest(agent.secret, "s2", wsId)).status).toBe(200);
});

it("rotates the token secret in place, killing the old one", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");
	await enableAgents(cookie);
	const wsId = await createWorkspace(cookie, "acme");
	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "CC" },
			cookie,
		)
	).json()) as { id: string; secret: string };
	expect((await ingest(agent.secret, "s1", wsId)).status).toBe(200);

	const rotated = (await (
		await apiJson(
			"POST",
			`/api/v1/agents/${agent.id}/token/rotate`,
			undefined,
			cookie,
		)
	).json()) as { secret: string };
	expect(rotated.secret).toMatch(/^spantail_aat_/);
	expect(rotated.secret).not.toBe(agent.secret);

	// The old secret stops working; the new one ingests as before.
	expect((await ingest(agent.secret, "s2", wsId)).status).toBe(401);
	expect((await ingest(rotated.secret, "s3", wsId)).status).toBe(200);
});

it("shows a member only their own agents in the sidebar", async () => {
	const owner = await signUpUser("Owner", "owner@example.com");
	await enableAgents(owner);
	const member = await signUpUser("Member", "member@example.com");
	const wsId = await createWorkspace(owner, "acme");
	await apiJson(
		"POST",
		`/api/v1/workspaces/${wsId}/members`,
		{ email: "member@example.com" },
		owner,
	);
	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "CC" },
			owner,
		)
	).json()) as { id: string; secret: string };

	const sidebar = async (cookie: string): Promise<string[]> => {
		const rows = (await (
			await apiGet(`/api/v1/agent-entries/agents?workspaceId=${wsId}`, cookie)
		).json()) as Array<{ id: string }>;
		return rows.map((r) => r.id);
	};

	// Purely activity-based: with no binding, a freshly registered agent is
	// listed nowhere until it logs work.
	expect(await sidebar(owner)).not.toContain(agent.id);

	// Agents are private to their owner: logging work exposes it to the owner
	// in that workspace only — never to other members.
	expect((await ingest(agent.secret, "s1", wsId)).status).toBe(200);
	expect(await sidebar(owner)).toContain(agent.id);
	expect(await sidebar(member)).not.toContain(agent.id);
});

it("cannot manage another user's agent", async () => {
	const alice = await signUpUser("Alice", "alice@example.com");
	const bob = await signUpUser("Bob", "bob@example.com");
	await enableAgents(alice);
	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "CC" },
			alice,
		)
	).json()) as { id: string };

	const patchDenied = await apiJson(
		"PATCH",
		`/api/v1/agents/${agent.id}`,
		{ disabled: true },
		bob,
	);
	expect(patchDenied.status).toBe(404);

	const rotateDenied = await apiJson(
		"POST",
		`/api/v1/agents/${agent.id}/token/rotate`,
		undefined,
		bob,
	);
	expect(rotateDenied.status).toBe(404);

	const deleteDenied = await apiJson(
		"DELETE",
		`/api/v1/agents/${agent.id}`,
		undefined,
		bob,
	);
	expect(deleteDenied.status).toBe(404);
});
