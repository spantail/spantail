import { env } from "cloudflare:workers";
import { createDb, materializeAgentSessionRollup } from "@spantail/db";
import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");
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
	return appFetch("/api/v1/agent-events", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

// One assistant turn. tokens = input+output+cacheCreation+cacheRead.
function turn(
	sourceId: string,
	timestamp: string,
	usage: Record<string, number>,
	model?: string,
) {
	return { sourceId, timestamp, usage, ...(model ? { model } : {}) };
}

it("materializes a session rollup from per-turn events", async () => {
	const { admin, ws, project } = await setup();
	const { agentId, token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});

	// workspaceId omitted → resolved from the token binding.
	const res = await ingest(token, {
		sessionId: "s1",
		projectId: project.id,
		events: [
			turn(
				"m1",
				"2026-06-20T01:00:00.000Z",
				{
					input_tokens: 100,
					output_tokens: 200,
					cache_creation_input_tokens: 50,
					cache_read_input_tokens: 1000,
				},
				"claude-opus-4-8",
			),
			// Later turn, sparse usage, no model.
			turn("m2", "2026-06-20T01:05:00.000Z", {
				input_tokens: 10,
				output_tokens: 20,
				cache_read_input_tokens: 500,
			}),
		],
	});
	expect(res.status).toBe(200);

	// (100+200+50+1000) + (10+20+0+500) = 1880.
	const list = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{
		durationMinutes: number;
		usage: {
			totalTokens: number;
			inputTokens: number;
			cacheReadTokens: number;
			model: string;
		};
		projectId: string;
	}>;
	expect(list).toHaveLength(1);
	expect(list[0]?.usage.totalTokens).toBe(1880);
	expect(list[0]?.usage.inputTokens).toBe(110);
	expect(list[0]?.usage.cacheReadTokens).toBe(1500);
	expect(list[0]?.durationMinutes).toBe(5);
	// Latest event carrying a model wins (m2 has none).
	expect(list[0]?.usage.model).toBe("claude-opus-4-8");
	expect(list[0]?.projectId).toBe(project.id);

	const stats = (await (
		await apiGet(`/api/v1/agent-entries/stats?workspaceId=${ws.id}`, admin)
	).json()) as { totalTokens: number; byAgent: Array<{ agentId: string }> };
	expect(stats.totalTokens).toBe(1880);
	expect(stats.byAgent[0]?.agentId).toBe(agentId);
});

it("is idempotent on (agent, sourceId): re-sends never double-count", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});

	const batch = {
		sessionId: "s1",
		events: [
			turn("m1", "2026-06-20T01:00:00.000Z", {
				input_tokens: 100,
				output_tokens: 200,
				cache_read_input_tokens: 1000,
			}),
			turn("m2", "2026-06-20T01:05:00.000Z", {
				input_tokens: 10,
				output_tokens: 20,
			}),
		],
	};
	// Total = 1300 + 30 = 1330; duration 5.
	expect((await ingest(token, batch)).status).toBe(200);
	// Re-post the identical cumulative transcript (what every Stop does).
	expect((await ingest(token, batch)).status).toBe(200);

	const afterResend = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{
		durationMinutes: number;
		usage: { totalTokens: number };
	}>;
	expect(afterResend).toHaveLength(1);
	expect(afterResend[0]?.usage.totalTokens).toBe(1330);
	expect(afterResend[0]?.durationMinutes).toBe(5);

	// A later Stop adds one new turn; only its tokens move the rollup.
	expect(
		(
			await ingest(token, {
				sessionId: "s1",
				events: [
					...batch.events,
					turn("m3", "2026-06-20T01:10:00.000Z", {
						input_tokens: 5,
						output_tokens: 5,
					}),
				],
			})
		).status,
	).toBe(200);

	const afterGrow = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{
		durationMinutes: number;
		usage: { totalTokens: number };
	}>;
	expect(afterGrow).toHaveLength(1);
	expect(afterGrow[0]?.usage.totalTokens).toBe(1340); // +10, not recounted
	expect(afterGrow[0]?.durationMinutes).toBe(10);
});

it("collapses duplicate sourceIds in one payload to a single event", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});

	// The same message.id repeated (as raw transcript lines would) must count
	// once — the unique index is the server-side safety net behind the jq dedup.
	const res = await ingest(token, {
		sessionId: "s1",
		events: [
			turn("dup", "2026-06-20T01:00:00.000Z", {
				input_tokens: 131,
				output_tokens: 323,
			}),
			turn("dup", "2026-06-20T01:00:01.000Z", {
				input_tokens: 131,
				output_tokens: 323,
			}),
		],
	});
	expect(res.status).toBe(200);

	const list = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{ usage: { totalTokens: number } }>;
	expect(list[0]?.usage.totalTokens).toBe(454); // 131+323, not doubled
});

it("ingests a session spanning multiple insert chunks", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});

	// More events than one insert chunk (10), to exercise chunking under D1's
	// 100-bound-parameter cap. Every turn must be counted exactly once.
	const N = 25;
	const events = Array.from({ length: N }, (_, i) =>
		turn(
			`m${i}`,
			new Date(Date.UTC(2026, 5, 20, 1, i)).toISOString(),
			{ input_tokens: 1, output_tokens: 1 },
			"claude-opus-4-8",
		),
	);
	expect((await ingest(token, { sessionId: "s1", events })).status).toBe(200);

	const list = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{
		durationMinutes: number;
		usage: { totalTokens: number };
	}>;
	expect(list).toHaveLength(1);
	expect(list[0]?.usage.totalTokens).toBe(N * 2); // every event counted once
	expect(list[0]?.durationMinutes).toBe(N - 1); // 1-minute spacing
});

it("keeps the materialized rollup monotonic against a stale write", async () => {
	const { admin, ws } = await setup();
	const { agentId } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});
	const me = (await (await apiGet("/api/v1/me", admin)).json()) as {
		user: { id: string };
	};
	const db = createDb(env.DB);
	const base = {
		workspaceId: ws.id,
		ownerUserId: me.user.id,
		projectId: null,
		agentId,
		sessionId: "race",
		entryDate: "2026-06-20",
		description: null,
		startedAt: new Date("2026-06-20T01:00:00.000Z"),
	};

	// The full rollup lands first (endedAt 01:10).
	await materializeAgentSessionRollup(db, {
		...base,
		durationMinutes: 10,
		usage: { totalTokens: 300 },
		endedAt: new Date("2026-06-20T01:10:00.000Z"),
	});
	// A stale concurrent recompute (older endedAt, smaller totals) arrives last
	// and must be ignored rather than shrink the row.
	await materializeAgentSessionRollup(db, {
		...base,
		durationMinutes: 0,
		usage: { totalTokens: 100 },
		endedAt: new Date("2026-06-20T01:00:00.000Z"),
	});

	const afterStale = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{
		durationMinutes: number;
		usage: { totalTokens: number };
	}>;
	expect(afterStale[0]?.usage.totalTokens).toBe(300);
	expect(afterStale[0]?.durationMinutes).toBe(10);

	// A stale recompute with the SAME endedAt but fewer tokens (the fuller payload
	// added an earlier-timestamped subagent turn) must also be ignored.
	await materializeAgentSessionRollup(db, {
		...base,
		durationMinutes: 10,
		usage: { totalTokens: 250 },
		endedAt: new Date("2026-06-20T01:10:00.000Z"),
	});
	const afterEqualEnded = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{ usage: { totalTokens: number } }>;
	expect(afterEqualEnded[0]?.usage.totalTokens).toBe(300);

	// A genuinely newer rollup (later endedAt) still moves it forward.
	await materializeAgentSessionRollup(db, {
		...base,
		durationMinutes: 20,
		usage: { totalTokens: 500 },
		endedAt: new Date("2026-06-20T01:20:00.000Z"),
	});
	const afterNewer = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{
		durationMinutes: number;
		usage: { totalTokens: number };
	}>;
	expect(afterNewer[0]?.usage.totalTokens).toBe(500);
	expect(afterNewer[0]?.durationMinutes).toBe(20);
});

it("rejects an empty events array at validation", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});
	const res = await ingest(token, { sessionId: "s1", events: [] });
	expect(res.status).toBe(400);
});

it("rejects an empty projectId with a 400 rather than a 500", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});
	const res = await ingest(token, {
		sessionId: "s1",
		projectId: "",
		events: [turn("m1", "2026-06-20T01:00:00.000Z", { output_tokens: 1 })],
	});
	expect(res.status).toBe(400);
});

it("rejects ingest once the agent's owner loses workspace membership", async () => {
	const { admin, member, ws, memberId } = await setup();
	const { token } = await createAgentToken(member, {
		defaultWorkspaceId: ws.id,
	});

	const allowed = await ingest(token, {
		sessionId: "m1",
		events: [turn("a", "2026-06-20T01:00:00.000Z", { output_tokens: 1 })],
	});
	expect(allowed.status).toBe(200);

	const removed = await apiJson(
		"DELETE",
		`/api/v1/workspaces/${ws.id}/members/${memberId}`,
		undefined,
		admin,
	);
	expect(removed.status).toBe(204);

	const denied = await ingest(token, {
		sessionId: "m2",
		events: [turn("b", "2026-06-20T01:00:00.000Z", { output_tokens: 1 })],
	});
	expect(denied.status).toBe(403);
});

it("treats agent tokens as write-only ingest credentials", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin, {
		defaultWorkspaceId: ws.id,
	});
	// Cannot read entries with an AAT (ingest only).
	const read = await appFetch("/api/v1/agent-entries?workspaceId=anything", {
		headers: { authorization: `Bearer ${token}` },
	});
	expect(read.status).toBe(403);
});
