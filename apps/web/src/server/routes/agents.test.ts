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
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug, name: slug, timezone: "Asia/Tokyo" },
			cookie,
		)
	).json()) as { id: string };
	return ws.id;
}

function ingest(token: string, sessionId: string): Promise<Response> {
	return appFetch("/api/v1/agent-entries", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ sessionId, durationMinutes: 1 }),
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
			{ type: "claude_code", name: "My CC", defaultWorkspaceId: wsId },
			cookie,
		)
	).json()) as {
		id: string;
		userId?: string;
		secret: string;
		token: { defaultWorkspaceId: string; tokenHash?: string };
	};
	expect(created.userId).toBeUndefined();
	expect(created.secret).toMatch(/^spantail_aat_/);
	expect(created.token.defaultWorkspaceId).toBe(wsId);
	expect(created.token.tokenHash).toBeUndefined();

	// The list embeds the token summary and never leaks the hash/secret.
	const list = (await (
		await apiGet("/api/v1/agents", cookie)
	).json()) as Array<{
		id: string;
		disabledAt: string | null;
		token: { defaultWorkspaceId: string };
		secret?: string;
	}>;
	expect(list).toHaveLength(1);
	expect(list[0]?.disabledAt).toBeNull();
	expect(list[0]?.token.defaultWorkspaceId).toBe(wsId);
	expect(list[0]?.secret).toBeUndefined();

	// The issued secret can ingest immediately (workspace from the binding).
	expect((await ingest(created.secret, "s1")).status).toBe(200);

	// Archiving the agent kills its token and drops it from the registry.
	const archived = await apiJson(
		"DELETE",
		`/api/v1/agents/${created.id}`,
		undefined,
		cookie,
	);
	expect(archived.status).toBe(204);
	expect((await ingest(created.secret, "s2")).status).toBe(401);
	expect(
		((await (await apiGet("/api/v1/agents", cookie)).json()) as unknown[])
			.length,
	).toBe(0);
});

it("requires a default workspace the issuer belongs to", async () => {
	const alice = await signUpUser("Alice", "alice@example.com");
	await enableAgents(alice);
	const wsId = await createWorkspace(alice, "acme");

	// No workspace at all → validation error.
	const missing = await apiJson(
		"POST",
		"/api/v1/agents",
		{ type: "codex", name: "CC" },
		alice,
	);
	expect(missing.status).toBe(400);

	// A non-member binding the workspace can't see it (404, not 403, so its
	// existence does not leak).
	const bob = await signUpUser("Bob", "bob@example.com");
	const denied = await apiJson(
		"POST",
		"/api/v1/agents",
		{ type: "codex", name: "CC", defaultWorkspaceId: wsId },
		bob,
	);
	expect(denied.status).toBe(404);
});

it("disables and re-enables an agent, gating ingest", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");
	await enableAgents(cookie);
	const wsId = await createWorkspace(cookie, "acme");
	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "CC", defaultWorkspaceId: wsId },
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
	expect((await ingest(agent.secret, "s1")).status).toBe(401);

	const enabled = await apiJson(
		"PATCH",
		`/api/v1/agents/${agent.id}`,
		{ disabled: false },
		cookie,
	);
	expect(
		((await enabled.json()) as { disabledAt: null }).disabledAt,
	).toBeNull();
	expect((await ingest(agent.secret, "s2")).status).toBe(200);
});

it("rotates the token secret in place, killing the old one", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");
	await enableAgents(cookie);
	const wsId = await createWorkspace(cookie, "acme");
	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "CC", defaultWorkspaceId: wsId },
			cookie,
		)
	).json()) as { id: string; secret: string };
	expect((await ingest(agent.secret, "s1")).status).toBe(200);

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

	// The old secret stops working; the new one keeps the same binding.
	expect((await ingest(agent.secret, "s2")).status).toBe(401);
	expect((await ingest(rotated.secret, "s3")).status).toBe(200);
});

it("associates an agent with projects, rejecting ones outside its workspace", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");
	await enableAgents(cookie);
	const wsId = await createWorkspace(cookie, "acme");
	const otherWsId = await createWorkspace(cookie, "beta");
	const projectId = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${wsId}/projects`,
			{ slug: "spantail", name: "Spantail" },
			cookie,
		)
	).json()) as { id: string };
	const foreign = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${otherWsId}/projects`,
			{ slug: "other", name: "Other" },
			cookie,
		)
	).json()) as { id: string };

	// A project from another workspace can't be associated.
	const denied = await apiJson(
		"POST",
		"/api/v1/agents",
		{
			type: "claude_code",
			name: "CC",
			defaultWorkspaceId: wsId,
			projectIds: [foreign.id],
		},
		cookie,
	);
	expect(denied.status).toBe(400);

	// In-workspace projects are accepted and echoed back on the registry.
	const created = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{
				type: "claude_code",
				name: "CC",
				defaultWorkspaceId: wsId,
				projectIds: [projectId.id],
			},
			cookie,
		)
	).json()) as { projectIds: string[] };
	expect(created.projectIds).toEqual([projectId.id]);

	const list = (await (
		await apiGet("/api/v1/agents", cookie)
	).json()) as Array<{ projectIds: string[] }>;
	expect(list[0]?.projectIds).toEqual([projectId.id]);
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
			{ type: "claude_code", name: "CC", defaultWorkspaceId: wsId },
			owner,
		)
	).json()) as { id: string; secret: string };

	const sidebar = async (cookie: string): Promise<string[]> => {
		const rows = (await (
			await apiGet(`/api/v1/agent-entries/agents?workspaceId=${wsId}`, cookie)
		).json()) as Array<{ id: string }>;
		return rows.map((r) => r.id);
	};

	// Registered but inactive: the owner sees it, another member does not.
	expect(await sidebar(owner)).toContain(agent.id);
	expect(await sidebar(member)).not.toContain(agent.id);

	// Agents are private to their owner: logging work does NOT expose it to
	// other members — the sidebar shows each member only their own agents.
	expect(
		(
			await appFetch("/api/v1/agent-entries", {
				method: "POST",
				headers: {
					authorization: `Bearer ${agent.secret}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ sessionId: "s1", durationMinutes: 1 }),
			})
		).status,
	).toBe(200);
	expect(await sidebar(owner)).toContain(agent.id);
	expect(await sidebar(member)).not.toContain(agent.id);
});

it("cannot manage another user's agent", async () => {
	const alice = await signUpUser("Alice", "alice@example.com");
	const bob = await signUpUser("Bob", "bob@example.com");
	await enableAgents(alice);
	const wsId = await createWorkspace(alice, "acme");
	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "codex", name: "Codex", defaultWorkspaceId: wsId },
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
