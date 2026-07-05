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
			{ slug: "acme", name: "Acme" },
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
			{ slug: "spantail", name: "Spantail" },
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
	binding: { defaultWorkspaceId: string; projectIds?: string[] },
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
	});

	// workspaceId omitted: resolved from the token binding. The project is named
	// explicitly (there is no token-level default project).
	const first = await ingest(token, {
		sessionId: "s1",
		projectId: project.id,
		durationMinutes: 10,
		usage: { totalTokens: 1000, model: "opus" },
		description: "did stuff",
	});
	expect(first.status).toBe(200);

	// Re-sending the same session updates the row rather than duplicating it.
	const second = await ingest(token, {
		sessionId: "s1",
		projectId: project.id,
		durationMinutes: 25,
		usage: { totalTokens: 3000, inputTokens: 1200, outputTokens: 1800 },
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
		await apiGet(
			`/api/v1/agent-entries/stats?workspaceId=${ws.id}&from=2020-01-01&to=2030-12-31`,
			admin,
		)
	).json()) as {
		entryCount: number;
		totalMinutes: number;
		totalTokens: number;
		totalInputTokens: number;
		totalOutputTokens: number;
		byDate: Array<{ inputTokens: number; outputTokens: number }>;
		byAgent: Array<{ agentId: string; tokens: number }>;
	};
	expect(stats.entryCount).toBe(1);
	expect(stats.totalMinutes).toBe(25);
	expect(stats.totalTokens).toBe(3000);
	// Input/output buckets are summed from usage JSON for the agent-screen widgets.
	expect(stats.totalInputTokens).toBe(1200);
	expect(stats.totalOutputTokens).toBe(1800);
	expect(stats.byDate[0]?.inputTokens).toBe(1200);
	expect(stats.byDate[0]?.outputTokens).toBe(1800);
	expect(stats.byAgent[0]?.agentId).toBe(agentId);

	// The agent now shows up as active in the workspace (powers the sidebar).
	const active = (await (
		await apiGet(`/api/v1/agent-entries/agents?workspaceId=${ws.id}`, admin)
	).json()) as Array<{ id: string }>;
	expect(active.map((a) => a.id)).toContain(agentId);
});

it("derives an agent session's day in the viewer's timezone", async () => {
	const { admin, ws, project } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});
	// 2026-06-01T15:30Z is still 2026-06-01 in UTC but already 2026-06-02 00:30
	// in Asia/Tokyo — agent entries store only the instant, so the calendar day
	// is a read-time projection in the viewer's timezone.
	await ingest(token, {
		sessionId: "s1",
		projectId: project.id,
		durationMinutes: 30,
		startedAt: "2026-06-01T15:30:00.000Z",
	});

	// Default viewer (no timezone set → UTC fallback): lands on 2026-06-01.
	const utcList = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{ entryDate: string }>;
	expect(utcList[0]?.entryDate).toBe("2026-06-01");

	// Same session, viewed after setting Asia/Tokyo: rolls into 2026-06-02.
	await apiJson("PATCH", "/api/v1/me", { timezone: "Asia/Tokyo" }, admin);
	const jstList = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{ entryDate: string }>;
	expect(jstList[0]?.entryDate).toBe("2026-06-02");
});

it("records no project when the ingest omits one", async () => {
	const { admin, ws, project } = await setup();
	// Associating projects with the agent is a presentation grouping only — it
	// must not act as an ingest default, so an unprojected ingest stays null.
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
		projectIds: [project.id],
	});

	const res = await ingest(token, {
		sessionId: "x1",
		durationMinutes: 5,
	});
	expect(res.status).toBe(200);
	const entry = (await res.json()) as { projectId: string | null };
	expect(entry.projectId).toBeNull();
});

it("rejects an empty projectId with a 400 rather than a 500", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});

	// An empty string is falsy but present; it must be rejected at validation,
	// not slip past the FK check and fail on insert.
	const res = await ingest(token, {
		sessionId: "e1",
		projectId: "",
		durationMinutes: 5,
	});
	expect(res.status).toBe(400);
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
	expect(token).toMatch(/^spantail_aat_/);

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

it("does not show a member another member's agents or activity", async () => {
	const { admin, member, ws } = await setup();
	// Both members work in the same workspace, each with their own agent.
	const a = await createAgentToken(admin, { defaultWorkspaceId: ws.id });
	const b = await createAgentToken(member, { defaultWorkspaceId: ws.id });
	await ingest(a.token, {
		sessionId: "sa",
		durationMinutes: 10,
		usage: { totalTokens: 1000 },
	});
	await ingest(b.token, {
		sessionId: "sb",
		durationMinutes: 5,
		usage: { totalTokens: 500 },
	});

	// The sidebar lists only the caller's own agents.
	const adminAgents = (await (
		await apiGet(`/api/v1/agent-entries/agents?workspaceId=${ws.id}`, admin)
	).json()) as Array<{ id: string }>;
	const memberAgents = (await (
		await apiGet(`/api/v1/agent-entries/agents?workspaceId=${ws.id}`, member)
	).json()) as Array<{ id: string }>;
	expect(adminAgents.map((x) => x.id)).toEqual([a.agentId]);
	expect(memberAgents.map((x) => x.id)).toEqual([b.agentId]);

	// The member's own activity is visible; the other member's is not — even when
	// explicitly querying by the other agent's id.
	const ownList = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, member)
	).json()) as Array<{ agentId: string }>;
	expect(ownList.map((e) => e.agentId)).toEqual([b.agentId]);

	const otherList = (await (
		await apiGet(
			`/api/v1/agent-entries?workspaceId=${ws.id}&agentId=${a.agentId}`,
			member,
		)
	).json()) as unknown[];
	expect(otherList).toHaveLength(0);

	const otherStats = (await (
		await apiGet(
			`/api/v1/agent-entries/stats?workspaceId=${ws.id}&from=2020-01-01&to=2030-12-31&agentId=${a.agentId}`,
			member,
		)
	).json()) as { entryCount: number; totalTokens: number };
	expect(otherStats.entryCount).toBe(0);
	expect(otherStats.totalTokens).toBe(0);

	// The admin is the workspace owner, so they read all agent activity in the
	// workspace (matrix R*): both agents' tokens, not just their own.
	const adminStats = (await (
		await apiGet(
			`/api/v1/agent-entries/stats?workspaceId=${ws.id}&from=2020-01-01&to=2030-12-31`,
			admin,
		)
	).json()) as { totalTokens: number };
	expect(adminStats.totalTokens).toBe(1500);
});

it("lets project members see co-members' agent activity in that project", async () => {
	const { admin, member, ws, project, memberId } = await setup();
	if (!memberId) throw new Error("memberId not resolved");
	// Member joins the project; admin (owner) may log to any project.
	await apiJson(
		"POST",
		`/api/v1/projects/${project.id}/members`,
		{ userId: memberId },
		admin,
	);
	const carol = await signUpUser("Carol", "carol@example.com");
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "carol@example.com" },
		admin,
	);

	const a = await createAgentToken(admin, { defaultWorkspaceId: ws.id });
	const b = await createAgentToken(member, { defaultWorkspaceId: ws.id });
	// Both agents log into the shared project.
	await ingest(a.token, {
		sessionId: "pa",
		projectId: project.id,
		durationMinutes: 10,
		usage: { totalTokens: 1000 },
	});
	await ingest(b.token, {
		sessionId: "pb",
		projectId: project.id,
		durationMinutes: 5,
		usage: { totalTokens: 500 },
	});
	// Admin's agent also logs unassigned (no project) activity.
	await ingest(a.token, {
		sessionId: "pn",
		durationMinutes: 7,
		usage: { totalTokens: 700 },
	});

	// The member is a project member, so they see both agents' project activity
	// (1000 + 500) but NOT the admin's unassigned, owner-only session (700).
	const memberStats = (await (
		await apiGet(
			`/api/v1/agent-entries/stats?workspaceId=${ws.id}&from=2020-01-01&to=2030-12-31`,
			member,
		)
	).json()) as { totalTokens: number };
	expect(memberStats.totalTokens).toBe(1500);

	// Carol is a workspace member but not a project member: she sees nothing.
	const carolStats = (await (
		await apiGet(
			`/api/v1/agent-entries/stats?workspaceId=${ws.id}&from=2020-01-01&to=2030-12-31`,
			carol,
		)
	).json()) as { totalTokens: number; entryCount: number };
	expect(carolStats.entryCount).toBe(0);
});

// --- bulk delete (owner-only, all-or-nothing) ---

async function ingestId(token: string, sessionId: string): Promise<string> {
	const res = await ingest(token, { sessionId, durationMinutes: 5 });
	expect(res.status).toBe(200);
	return ((await res.json()) as { id: string }).id;
}

function deleteEntries(
	cookie: string,
	workspaceId: string,
	ids: string[],
): Promise<Response> {
	return apiJson(
		"POST",
		"/api/v1/agent-entries/delete",
		{ workspaceId, ids },
		cookie,
	);
}

async function listIds(cookie: string, workspaceId: string): Promise<string[]> {
	const list = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${workspaceId}`, cookie)
	).json()) as Array<{ id: string }>;
	return list.map((e) => e.id).sort();
}

it("bulk-deletes the caller's own agent entries, deduping ids", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});
	const a = await ingestId(token, "del-a");
	const b = await ingestId(token, "del-b");
	const keep = await ingestId(token, "del-keep");

	// A duplicated id counts once — the response reflects unique rows deleted.
	const res = await deleteEntries(admin, ws.id, [a, b, a]);
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ count: 2 });
	expect(await listIds(admin, ws.id)).toEqual([keep]);
});

it("deletes nothing when any id is foreign (all-or-nothing)", async () => {
	const { admin, member, ws } = await setup();
	const a = await createAgentToken(admin, { defaultWorkspaceId: ws.id });
	const b = await createAgentToken(member, { defaultWorkspaceId: ws.id });
	const adminEntry = await ingestId(a.token, "mine-admin");
	const memberEntry = await ingestId(b.token, "mine-member");

	// The member's own id is valid, but the batch includes the admin's entry:
	// 404 (existence hidden) and the member's own entry survives too.
	const res = await deleteEntries(member, ws.id, [memberEntry, adminEntry]);
	expect(res.status).toBe(404);
	// The admin is the workspace owner (R*), so they see both remaining rows.
	expect(await listIds(admin, ws.id)).toEqual([adminEntry, memberEntry].sort());
});

it("does not let a workspace admin delete a member's agent entries", async () => {
	const { admin, member, ws } = await setup();
	const b = await createAgentToken(member, { defaultWorkspaceId: ws.id });
	const memberEntry = await ingestId(b.token, "member-owned");

	// Admins read all workspace agent activity but never write user data.
	const res = await deleteEntries(admin, ws.id, [memberEntry]);
	expect(res.status).toBe(404);
	expect(await listIds(member, ws.id)).toEqual([memberEntry]);
});

it("scopes deletion to the named workspace", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});
	const entry = await ingestId(token, "ws-scoped");

	// Same owner, wrong workspace: the entry is not addressable through ws2.
	const ws2 = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "other", name: "Other" },
			admin,
		)
	).json()) as { id: string };
	expect((await deleteEntries(admin, ws2.id, [entry])).status).toBe(404);

	// A non-member cannot even address the workspace.
	const outsider = await signUpUser("Outsider", "outsider@example.com");
	expect((await deleteEntries(outsider, ws.id, [entry])).status).toBe(404);

	expect(await listIds(admin, ws.id)).toEqual([entry]);
});

it("requires the write scope to delete", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});
	const entry = await ingestId(token, "scope-guard");

	const pat = (await (
		await apiJson(
			"POST",
			"/api/v1/tokens",
			{ name: "reader", scopes: ["read"] },
			admin,
		)
	).json()) as { token: string };
	const res = await appFetch("/api/v1/agent-entries/delete", {
		method: "POST",
		headers: {
			authorization: `Bearer ${pat.token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ workspaceId: ws.id, ids: [entry] }),
	});
	expect(res.status).toBe(403);
});
