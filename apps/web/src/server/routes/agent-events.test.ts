import { env } from "cloudflare:workers";
import { computeActiveDurationMinutes } from "@spantail/core";
import { createDb, materializeAgentSessionRollup, schema } from "@spantail/db";
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
): Promise<{ agentId: string; token: string }> {
	const created = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "CC" },
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
	const { agentId, token } = await createAgentToken(admin);

	// The payload names its workspace explicitly (tokens carry no binding).
	const res = await ingest(token, {
		workspaceId: ws.id,
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
		await apiGet(
			`/api/v1/agent-entries/stats?workspaceId=${ws.id}&from=2020-01-01&to=2030-12-31`,
			admin,
		)
	).json()) as { totalTokens: number; byAgent: Array<{ agentId: string }> };
	expect(stats.totalTokens).toBe(1880);
	expect(stats.byAgent[0]?.agentId).toBe(agentId);
});

it("is idempotent on (agent, sourceId): re-sends never double-count", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);

	const batch = {
		workspaceId: ws.id,
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
				workspaceId: ws.id,
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
	const { token } = await createAgentToken(admin);

	// The same message.id repeated (as raw transcript lines would) must count
	// once — the unique index is the server-side safety net behind the jq dedup.
	const res = await ingest(token, {
		workspaceId: ws.id,
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
	const { token } = await createAgentToken(admin);

	// More events than one insert chunk (8), to exercise chunking under D1's
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
	expect(
		(await ingest(token, { workspaceId: ws.id, sessionId: "s1", events }))
			.status,
	).toBe(200);

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

it("derives an idle-excluded active duration from event gaps", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);

	// Gaps of 5 min, 35 min (idle, dropped), and exactly 15 min (the cutoff,
	// counted): 20 active minutes out of a 55-minute wall-clock span.
	const instants = [
		"2026-06-20T01:00:00.000Z",
		"2026-06-20T01:05:00.000Z",
		"2026-06-20T01:40:00.000Z",
		"2026-06-20T01:55:00.000Z",
	];
	expect(
		(
			await ingest(token, {
				workspaceId: ws.id,
				sessionId: "s1",
				events: instants.map((ts, i) =>
					turn(`m${i}`, ts, { input_tokens: 1, output_tokens: 1 }),
				),
			})
		).status,
	).toBe(200);

	const list = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{
		durationMinutes: number;
		activeDurationMinutes: number | null;
	}>;
	expect(list[0]?.durationMinutes).toBe(55);
	expect(list[0]?.activeDurationMinutes).toBe(20);
	// The SQL rollup and the core JS spec must agree on the same inputs.
	expect(list[0]?.activeDurationMinutes).toBe(
		computeActiveDurationMinutes(instants.map((ts) => Date.parse(ts))),
	);

	// Session-time stats count the active minutes, not the wall-clock span.
	const stats = (await (
		await apiGet(
			`/api/v1/agent-entries/stats?workspaceId=${ws.id}&from=2020-01-01&to=2030-12-31`,
			admin,
		)
	).json()) as { totalMinutes: number };
	expect(stats.totalMinutes).toBe(20);
});

it("counts the finalize tail as active only within the idle cutoff", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);

	// Finalize timestamps run through isTimestampInRange; anchor near the clock.
	const anchor = Date.now() - 60 * 60_000;
	const t = (minutes: number) =>
		new Date(anchor + minutes * 60_000).toISOString();
	const read = async () =>
		(await (
			await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
		).json()) as Array<{
			sessionId: string;
			durationMinutes: number;
			activeDurationMinutes: number | null;
		}>;
	const bySession = (
		entries: Awaited<ReturnType<typeof read>>,
		sessionId: string,
	) => entries.find((e) => e.sessionId === sessionId);

	const events = [
		turn("a1", t(0), { input_tokens: 1, output_tokens: 1 }),
		turn("a2", t(5), { input_tokens: 1, output_tokens: 1 }),
	];
	await ingest(token, { workspaceId: ws.id, sessionId: "s-near", events });
	// Trailing tool activity 3 min past the last event: within the cutoff, so
	// the tail counts as active (5 + 3).
	expect(
		(
			await finalize(token, {
				workspaceId: ws.id,
				sessionId: "s-near",
				endedAt: t(8),
			})
		).status,
	).toBe(200);
	let near = bySession(await read(), "s-near");
	expect(near?.durationMinutes).toBe(8);
	expect(near?.activeDurationMinutes).toBe(8);

	// A finalize retry re-derives the same total (idempotent).
	await finalize(token, {
		workspaceId: ws.id,
		sessionId: "s-near",
		endedAt: t(8),
	});
	// A Stop re-post after the finalize recomputes 5 active minutes from events
	// and re-derives the 3-minute tail against the finalized end — the total
	// must not shrink to 5.
	await ingest(token, { workspaceId: ws.id, sessionId: "s-near", events });
	near = bySession(await read(), "s-near");
	expect(near?.durationMinutes).toBe(8);
	expect(near?.activeDurationMinutes).toBe(8);

	// A tail beyond the cutoff extends the wall-clock span only.
	const farEvents = [
		turn("b1", t(0), { input_tokens: 1, output_tokens: 1 }),
		turn("b2", t(5), { input_tokens: 1, output_tokens: 1 }),
	];
	await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s-far",
		events: farEvents,
	});
	expect(
		(
			await finalize(token, {
				workspaceId: ws.id,
				sessionId: "s-far",
				endedAt: t(30),
			})
		).status,
	).toBe(200);
	let far = bySession(await read(), "s-far");
	expect(far?.durationMinutes).toBe(30);
	expect(far?.activeDurationMinutes).toBe(5);

	// A second finalize with a later end measures the tail from the last EVENT,
	// not the previously stored endedAt — repeated finalizes with growing ends
	// must not accumulate pure idle as active time.
	await finalize(token, {
		workspaceId: ws.id,
		sessionId: "s-far",
		endedAt: t(35),
	});
	far = bySession(await read(), "s-far");
	expect(far?.durationMinutes).toBe(35);
	expect(far?.activeDurationMinutes).toBe(5);

	// A late event after the finalize re-derives the tail against the new last
	// event: gaps 5/20 keep 5 active, plus the now-in-range 25→35 tail.
	await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s-far",
		events: [
			...farEvents,
			turn("b3", t(25), { input_tokens: 1, output_tokens: 1 }),
		],
	});
	far = bySession(await read(), "s-far");
	expect(far?.durationMinutes).toBe(35);
	expect(far?.activeDurationMinutes).toBe(15);

	// Fractional components round ONCE over the summed interval, matching
	// computeActiveDurationMinutes: a 30 s gap + a 30 s tail is 1 minute, not
	// round(0.5) + round(0.5) = 2.
	await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s-frac",
		events: [
			turn("c1", t(0), { input_tokens: 1, output_tokens: 1 }),
			turn("c2", t(0.5), { input_tokens: 1, output_tokens: 1 }),
		],
	});
	await finalize(token, {
		workspaceId: ws.id,
		sessionId: "s-frac",
		endedAt: t(1),
	});
	const frac = bySession(await read(), "s-frac");
	expect(frac?.durationMinutes).toBe(1);
	expect(frac?.activeDurationMinutes).toBe(1);
});

it("clears the active duration when a summary upsert takes over the session", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);

	await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		events: [
			turn("m1", "2026-06-20T01:00:00.000Z", { output_tokens: 1 }),
			turn("m2", "2026-06-20T01:05:00.000Z", { output_tokens: 1 }),
		],
	});

	// The same session re-submitted through the summary endpoint replaces the
	// wall-clock fields; the event-derived active duration must not sit stale
	// next to them.
	const summary = await appFetch("/api/v1/agent-entries", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			workspaceId: ws.id,
			sessionId: "s1",
			durationMinutes: 30,
		}),
	});
	expect(summary.status).toBe(200);

	const read = async () =>
		(await (
			await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
		).json()) as Array<{
			durationMinutes: number;
			activeDurationMinutes: number | null;
			eventCount: number | null;
		}>;
	let list = await read();
	expect(list[0]?.durationMinutes).toBe(30);
	expect(list[0]?.activeDurationMinutes).toBeNull();
	// The takeover is complete: the rollup bookkeeping is cleared too, so the
	// row reads as summary-path.
	expect(list[0]?.eventCount).toBeNull();

	// A finalize after the takeover must not re-derive active time from the
	// superseded events.
	await appFetch("/api/v1/agent-events/finalize", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			workspaceId: ws.id,
			sessionId: "s1",
			endedAt: new Date().toISOString(),
		}),
	});
	list = await read();
	expect(list[0]?.activeDurationMinutes).toBeNull();
});

it("keeps the materialized rollup monotonic against a stale write", async () => {
	const { admin, ws } = await setup();
	const { agentId } = await createAgentToken(admin);
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

	// The full rollup lands first (3 events, endedAt 01:10).
	await materializeAgentSessionRollup(db, {
		...base,
		durationMinutes: 10,
		usage: { totalTokens: 300 },
		rollupEventCount: 3,
		endedAt: new Date("2026-06-20T01:10:00.000Z"),
	});
	// A stale concurrent recompute (fewer events, smaller totals) arrives last
	// and must be ignored rather than shrink the row.
	await materializeAgentSessionRollup(db, {
		...base,
		durationMinutes: 0,
		usage: { totalTokens: 100 },
		rollupEventCount: 1,
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

	// A stale recompute with the SAME token total but fewer events (the fuller
	// payload added a token-less tool turn whose cost/context still moved) must
	// also be ignored — the event count, not the token sum, is what decides.
	await materializeAgentSessionRollup(db, {
		...base,
		durationMinutes: 10,
		usage: { totalTokens: 300 },
		rollupEventCount: 2,
		endedAt: new Date("2026-06-20T01:10:00.000Z"),
		context: { branches: ["stale-branch"] },
	});
	const afterEqualTokens = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{
		usage: { totalTokens: number };
		context: { branches?: string[] } | null;
	}>;
	expect(afterEqualTokens[0]?.usage.totalTokens).toBe(300);
	expect(afterEqualTokens[0]?.context?.branches).toBeUndefined();

	// A genuinely newer rollup (more events) still moves it forward.
	await materializeAgentSessionRollup(db, {
		...base,
		durationMinutes: 20,
		usage: { totalTokens: 500 },
		rollupEventCount: 4,
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

it("rejects a far-future event timestamp at validation", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);
	// endedAt — the last-activity sort key — is the max event timestamp; an
	// implausible instant must not be able to pin a session to the top.
	const res = await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		events: [
			turn(
				"m1",
				new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
				{ output_tokens: 1 },
			),
		],
	});
	expect(res.status).toBe(400);
});

it("rejects an empty events array at validation", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);
	const res = await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		events: [],
	});
	expect(res.status).toBe(400);
});

it("rejects an empty projectId with a 400 rather than a 500", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);
	const res = await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		projectId: "",
		events: [turn("m1", "2026-06-20T01:00:00.000Z", { output_tokens: 1 })],
	});
	expect(res.status).toBe(400);
});

it("rejects ingest once the agent's owner loses workspace membership", async () => {
	const { admin, member, ws, memberId } = await setup();
	const { token } = await createAgentToken(member);

	const allowed = await ingest(token, {
		workspaceId: ws.id,
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
		workspaceId: ws.id,
		sessionId: "m2",
		events: [turn("b", "2026-06-20T01:00:00.000Z", { output_tokens: 1 })],
	});
	expect(denied.status).toBe(403);
});

it("rolls up costUsd and context facets from event metadata", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);

	const res = await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		events: [
			{
				...turn(
					"m1",
					"2026-06-20T01:00:00.000Z",
					{ input_tokens: 10, output_tokens: 20 },
					"claude-haiku-4-5",
				),
				costUsd: 0.1,
				attributes: {
					"vcs.ref.head.name": "feature/123-foo",
					"vcs.repository.url.full": "https://github.com/acme/app",
					"app.version": "2.1.0",
				},
			},
			{
				...turn(
					"m2",
					"2026-06-20T01:05:00.000Z",
					{ input_tokens: 1, output_tokens: 2 },
					"claude-opus-4-8",
				),
				costUsd: 0.25,
				// A schema-legal but non-string attribute value must be skipped by
				// the facet read (defensive schema-on-read), never coerced.
				attributes: { "vcs.ref.head.name": 123 },
			},
		],
	});
	expect(res.status).toBe(200);

	const list = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{
		eventCount: number | null;
		usage: { costUsd: number; model: string };
		context: {
			models: string[];
			branches: string[];
			repositories: string[];
		};
	}>;
	expect(list).toHaveLength(1);
	// The rollup's event count is exposed as `eventCount` (two events ingested).
	expect(list[0]?.eventCount).toBe(2);
	expect(list[0]?.usage.costUsd).toBeCloseTo(0.35);
	expect(list[0]?.usage.model).toBe("claude-opus-4-8");
	// Distinct, first-seen order; the non-string branch value is ignored.
	expect(list[0]?.context.models).toEqual([
		"claude-haiku-4-5",
		"claude-opus-4-8",
	]);
	expect(list[0]?.context.branches).toEqual(["feature/123-foo"]);
	expect(list[0]?.context.repositories).toEqual([
		"https://github.com/acme/app",
	]);
	// Internal rollup bookkeeping never leaves the server.
	expect(Object.keys(list[0] ?? {})).not.toContain("rollupEventCount");
});

it("omits costUsd from the rollup when no event carries one", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);
	await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		events: [turn("m1", "2026-06-20T01:00:00.000Z", { output_tokens: 1 })],
	});
	const list = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as Array<{ usage: { costUsd?: number } }>;
	expect(list[0]?.usage.costUsd).toBeUndefined();
});

function finalize(token: string, body: unknown): Promise<Response> {
	return appFetch("/api/v1/agent-events/finalize", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

it("finalizes a session and preserves the closing facts across late ingests", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);

	// Finalize timestamps run through isTimestampInRange, so the session must
	// sit near the test-time clock. Anchor once so every t(n) is stable across
	// calls (the assertions re-derive the same instants).
	const anchor = Date.now() - 60 * 60_000;
	const t = (minutes: number) =>
		new Date(anchor + minutes * 60_000).toISOString();
	const events = [
		turn("m1", t(0), { input_tokens: 10, output_tokens: 20 }),
		turn("m2", t(5), { input_tokens: 1, output_tokens: 2 }),
	];
	expect(
		(await ingest(token, { workspaceId: ws.id, sessionId: "s1", events }))
			.status,
	).toBe(200);

	// SessionEnd: wall-clock end 3 minutes past the last event, a summary, refs.
	const fin = await finalize(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		endedAt: t(8),
		description: "Refactored the login flow",
		context: { refs: ["github:acme/app#12"] },
	});
	expect(fin.status).toBe(200);

	const read = async () =>
		(await (
			await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
		).json()) as Array<{
			durationMinutes: number;
			description: string | null;
			endedAt: string;
			usage: { totalTokens: number };
			context: { refs?: string[] } | null;
		}>;

	const finalized = await read();
	expect(finalized[0]?.description).toBe("Refactored the login flow");
	expect(finalized[0]?.context?.refs).toEqual(["github:acme/app#12"]);
	expect(new Date(finalized[0]?.endedAt ?? 0).toISOString()).toBe(t(8));
	// Duration extends to the finalized end (8 min), never shrinks.
	expect(finalized[0]?.durationMinutes).toBe(8);

	// A late Stop re-post (retry) must not erase the closing facts nor shrink
	// endedAt back to the last event's timestamp.
	expect(
		(await ingest(token, { workspaceId: ws.id, sessionId: "s1", events }))
			.status,
	).toBe(200);
	const afterLate = await read();
	expect(afterLate[0]?.description).toBe("Refactored the login flow");
	expect(afterLate[0]?.context?.refs).toEqual(["github:acme/app#12"]);
	expect(new Date(afterLate[0]?.endedAt ?? 0).toISOString()).toBe(t(8));
	expect(afterLate[0]?.usage.totalTokens).toBe(33);

	// A genuinely new turn still grows the rollup without touching the facts.
	expect(
		(
			await ingest(token, {
				workspaceId: ws.id,
				sessionId: "s1",
				events: [
					...events,
					turn("m3", t(6), { input_tokens: 5, output_tokens: 5 }),
				],
			})
		).status,
	).toBe(200);
	const afterGrowth = await read();
	expect(afterGrowth[0]?.usage.totalTokens).toBe(43);
	expect(afterGrowth[0]?.description).toBe("Refactored the login flow");
	expect(new Date(afterGrowth[0]?.endedAt ?? 0).toISOString()).toBe(t(8));

	// A late ingest can also move the START earlier (a backfilled subagent
	// turn). The duration must then span the new start to the finalized end —
	// neither the event-derived duration nor the previous stored one covers
	// that combination.
	expect(
		(
			await ingest(token, {
				workspaceId: ws.id,
				sessionId: "s1",
				events: [turn("m0", t(-2), { input_tokens: 1, output_tokens: 1 })],
			})
		).status,
	).toBe(200);
	const afterBackfill = await read();
	expect(new Date(afterBackfill[0]?.endedAt ?? 0).toISOString()).toBe(t(8));
	expect(afterBackfill[0]?.durationMinutes).toBe(10); // t(-2) → t(8)
});

it("clamps a finalize endedAt that lands before the session start", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);

	const anchor = Date.now() - 60 * 60_000;
	const t = (minutes: number) =>
		new Date(anchor + minutes * 60_000).toISOString();
	await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		events: [turn("m1", t(0), { output_tokens: 1 })],
	});

	// In-range but before the session started (a bad client clock): the stored
	// end must never precede startedAt, and the duration must not go negative.
	const res = await finalize(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		endedAt: t(-30),
	});
	expect(res.status).toBe(200);
	const entry = (await res.json()) as {
		startedAt: string;
		endedAt: string;
		durationMinutes: number;
	};
	expect(new Date(entry.endedAt).toISOString()).toBe(t(0));
	expect(entry.durationMinutes).toBe(0);
});

it("returns 404 when finalizing a session with no entry yet", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);
	const res = await finalize(token, {
		workspaceId: ws.id,
		sessionId: "never-seen",
		description: "irrelevant",
	});
	expect(res.status).toBe(404);
});

// The usage Claude Code actually sends nests one level. The rollup reads the
// flat buckets with json_extract, so the nested ones ride along untouched.
it("ingests the real nested usage shape and rolls up the flat buckets", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);

	const res = await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		events: [
			{
				sourceId: "m1",
				timestamp: "2026-06-20T01:00:00.000Z",
				usage: {
					input_tokens: 5,
					output_tokens: 1,
					cache_creation_input_tokens: 19681,
					cache_read_input_tokens: 0,
					service_tier: "standard",
					cache_creation: {
						ephemeral_5m_input_tokens: 19681,
						ephemeral_1h_input_tokens: 0,
					},
					server_tool_use: { web_search_requests: 0 },
				},
			},
		],
	});
	expect(res.status).toBe(200);
	const entry = (await res.json()) as { usage: { totalTokens: number } };
	expect(entry.usage.totalTokens).toBe(19687);
});

// Current Claude Code usage carries `iterations` — an array of records with a
// third nesting level. Out-of-shape values are pruned at ingest, not rejected:
// a 400 here would kill the session's whole batch and the Stop hook drops the
// failure silently (#257).
it("prunes usage.iterations at ingest and stores the pruned usage", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);

	const res = await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		events: [
			{
				sourceId: "m1",
				timestamp: "2026-06-20T01:00:00.000Z",
				usage: {
					input_tokens: 5,
					output_tokens: 1,
					cache_creation_input_tokens: 19681,
					cache_read_input_tokens: 0,
					cache_creation: {
						ephemeral_5m_input_tokens: 19681,
						ephemeral_1h_input_tokens: 0,
					},
					iterations: [
						{
							type: "message",
							input_tokens: 5,
							output_tokens: 1,
							cache_creation: { ephemeral_5m_input_tokens: 19681 },
						},
					],
				},
			},
		],
	});
	expect(res.status).toBe(200);
	const entry = (await res.json()) as { usage: { totalTokens: number } };
	expect(entry.usage.totalTokens).toBe(19687);

	const db = createDb(env.DB);
	const stored = await db.select().from(schema.agentEvents);
	const ev = stored.find((e) => e.sourceId === "m1");
	expect(ev?.usage).not.toHaveProperty("iterations");
	expect(ev?.usage).toMatchObject({
		cache_creation: { ephemeral_5m_input_tokens: 19681 },
	});
});

it("rejects an unbounded usage object", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);
	const res = await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		events: [
			{
				sourceId: "m1",
				timestamp: "2026-06-20T01:00:00.000Z",
				usage: { blob: "x".repeat(10_000) },
			},
		],
	});
	expect(res.status).toBe(400);
});

it("rejects an oversized ingest body before parsing it", async () => {
	const { admin, ws } = await setup();
	const { token } = await createAgentToken(admin);
	const res = await ingest(token, {
		workspaceId: ws.id,
		sessionId: "s1",
		pad: "x".repeat(8 * 1024 * 1024),
		events: [turn("m1", "2026-06-20T01:00:00.000Z", { input_tokens: 1 })],
	});
	expect(res.status).toBe(413);
	expect(await res.json()).toEqual({
		error: { code: "bad_request", message: "Payload too large" },
	});
});

it("treats agent tokens as write-only ingest credentials", async () => {
	const { admin } = await setup();
	const { token } = await createAgentToken(admin);
	// Cannot read entries with an AAT (ingest only).
	const read = await appFetch("/api/v1/agent-entries?workspaceId=anything", {
		headers: { authorization: `Bearer ${token}` },
	});
	expect(read.status).toBe(403);
});
