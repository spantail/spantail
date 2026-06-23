import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");
	// The agents feature is off by default; the bootstrap admin enables it.
	await apiJson(
		"PATCH",
		"/api/v1/instance/agents",
		{ agentsEnabled: true },
		admin,
	);
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			admin,
		)
	).json()) as { id: string };
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		admin,
	);
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "toxil", name: "Toxil" },
			admin,
		)
	).json()) as { id: string };
	const members = (await (
		await apiGet(`/api/v1/workspaces/${ws.id}/members`, admin)
	).json()) as Array<{ userId: string; email: string }>;
	const memberId = members.find(
		(m) => m.email === "member@example.com",
	)?.userId;
	return { admin, member, ws, project, memberId };
}

async function createAgentToken(
	cookie: string,
	binding: { defaultWorkspaceId: string; defaultProjectId?: string },
): Promise<{ agentId: string; token: string }> {
	// Registering an agent issues its single token in one step; the plaintext
	// secret is returned once.
	const created = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "CC", ...binding },
			cookie,
		)
	).json()) as { id: string; secret: string };
	return { agentId: created.id, token: created.secret };
}

function ingest(token: string, body: unknown): Promise<Response> {
	return appFetch("/api/v1/agent-entries", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

it("ingests a session idempotently on (agent, sessionId)", async () => {
	const { admin, ws, project } = await setup();
	const { agentId, token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
		defaultProjectId: project.id,
	});

	// workspaceId omitted: resolved from the token binding.
	const first = await ingest(token, {
		sessionId: "s1",
		durationMinutes: 10,
		usage: { totalTokens: 1000, model: "opus" },
		description: "did stuff",
	});
	expect(first.status).toBe(200);

	// Re-sending the same session updates the row rather than duplicating it.
	const second = await ingest(token, {
		sessionId: "s1",
		durationMinutes: 25,
		usage: { totalTokens: 3000 },
	});
	expect(second.status).toBe(200);

	const list = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{
		durationMinutes: number;
		usage: { totalTokens: number };
		projectId: string;
	}>;
	expect(list).toHaveLength(1);
	expect(list[0]?.durationMinutes).toBe(25);
	expect(list[0]?.usage.totalTokens).toBe(3000);
	expect(list[0]?.projectId).toBe(project.id);

	const stats = (await (
		await apiGet(`/api/v1/agent-entries/stats?workspaceId=${ws.id}`, admin)
	).json()) as {
		entryCount: number;
		totalMinutes: number;
		totalTokens: number;
		byAgent: Array<{ agentId: string; tokens: number }>;
	};
	expect(stats.entryCount).toBe(1);
	expect(stats.totalMinutes).toBe(25);
	expect(stats.totalTokens).toBe(3000);
	expect(stats.byAgent[0]?.agentId).toBe(agentId);

	// The agent now shows up as active in the workspace (powers the sidebar).
	const active = (await (
		await apiGet(`/api/v1/agent-entries/agents?workspaceId=${ws.id}`, admin)
	).json()) as Array<{ id: string }>;
	expect(active.map((a) => a.id)).toContain(agentId);
});

it("drops the token's default project when ingesting into another workspace", async () => {
	const { admin, ws, project } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
		defaultProjectId: project.id,
	});

	// A second workspace the owner belongs to, with no project of its own.
	const ws2 = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "beta", name: "Beta", timezone: "Asia/Tokyo" },
			admin,
		)
	).json()) as { id: string };

	// Overriding the workspace without a project must not carry the default
	// project (which belongs to ws) into ws2; the entry lands unprojected.
	const res = await ingest(token, {
		workspaceId: ws2.id,
		sessionId: "x1",
		durationMinutes: 5,
	});
	expect(res.status).toBe(200);
	const entry = (await res.json()) as { projectId: string | null };
	expect(entry.projectId).toBeNull();
});

it("rejects ingest once the agent's owner loses workspace membership", async () => {
	const { admin, member, ws, memberId } = await setup();
	const { token } = await createAgentToken(member, {
		defaultWorkspaceId: ws.id,
	});

	const allowed = await ingest(token, { sessionId: "m1", durationMinutes: 5 });
	expect(allowed.status).toBe(200);

	// Removing the owner from the workspace cuts the delegated credential too:
	// the agent can never exceed its owner's live access.
	const removed = await apiJson(
		"DELETE",
		`/api/v1/workspaces/${ws.id}/members/${memberId}`,
		undefined,
		admin,
	);
	expect(removed.status).toBe(204);

	const denied = await ingest(token, { sessionId: "m2", durationMinutes: 5 });
	expect(denied.status).toBe(403);
});

it("treats agent tokens as write-only ingest credentials", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});
	expect(token).toMatch(/^toxil_aat_/);

	// Cannot act as a user on session/PAT routes.
	const me = await appFetch("/api/v1/me", {
		headers: { authorization: `Bearer ${token}` },
	});
	expect(me.status).toBe(403);

	// Cannot read agent entries either (no scopes; ingest only).
	const read = await appFetch("/api/v1/agent-entries?workspaceId=anything", {
		headers: { authorization: `Bearer ${token}` },
	});
	expect(read.status).toBe(403);
});

it("does not leak agent entries across workspaces", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});
	await ingest(token, { sessionId: "s1", durationMinutes: 10 });

	// The member belongs to ws, but a non-member must get 404 for it. Create a
	// second workspace owned by member and confirm ws stays invisible to outsiders.
	const outsider = await signUpUser("Outsider", "outsider@example.com");
	const denied = await apiGet(
		`/api/v1/agent-entries?workspaceId=${ws.id}`,
		outsider,
	);
	expect(denied.status).toBe(404);
});
