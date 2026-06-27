import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

// The test pool overrides INGEST_RATE_LIMITER to 10 requests / 60s (see
// vitest.config.ts); production uses the higher wrangler.jsonc limit.
const TEST_LIMIT = 10;

async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");
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
	const memberId = (
		(await (await apiGet("/api/v1/me", member)).json()) as {
			user: { id: string };
		}
	).user.id;
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "spantail", name: "Spantail", memberUserIds: [memberId] },
			admin,
		)
	).json()) as { id: string };
	return { admin, member, ws, project };
}

function createEntry(cookie: string, ws: string, project: string) {
	return apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws,
			projectId: project,
			durationMinutes: 30,
			description: "work",
		},
		cookie,
	);
}

/** Issues a read+write PAT for the given session and returns its bearer token. */
async function createPat(cookie: string): Promise<string> {
	const { token } = (await (
		await apiJson(
			"POST",
			"/api/v1/tokens",
			{ name: "dev", scopes: ["read", "write"] },
			cookie,
		)
	).json()) as { token: string };
	return token;
}

/** Creates a work entry authenticated with a bearer token (PAT). */
function createEntryWithToken(token: string, ws: string, project: string) {
	return appFetch("/api/v1/work-entries", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			workspaceId: ws,
			projectId: project,
			durationMinutes: 30,
			description: "work",
		}),
	});
}

/** Registers an agent (and its single ingest token) bound to a workspace. */
async function createAgentToken(
	cookie: string,
	ws: string,
	project: string,
): Promise<string> {
	const { secret } = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{
				type: "claude_code",
				name: "CC",
				defaultWorkspaceId: ws,
				projectIds: [project],
			},
			cookie,
		)
	).json()) as { secret: string };
	return secret;
}

/** Ingests one agent session entry with a bearer agent access token. */
function ingestAgentEntry(token: string, sessionId: string) {
	return appFetch("/api/v1/agent-entries", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ sessionId, durationMinutes: 5 }),
	});
}

it("rate-limits ingestion once a credential exceeds its quota", async () => {
	const { admin, ws, project } = await setup();

	for (let i = 0; i < TEST_LIMIT; i++) {
		expect((await createEntry(admin, ws.id, project.id)).status).toBe(201);
	}

	const blocked = await createEntry(admin, ws.id, project.id);
	expect(blocked.status).toBe(429);
	const body = (await blocked.json()) as { error: { code: string } };
	expect(body.error.code).toBe("rate_limited");
});

it("buckets the rate limit per credential, not globally", async () => {
	const { admin, member, ws, project } = await setup();

	// Exhaust the admin's bucket.
	for (let i = 0; i < TEST_LIMIT; i++) {
		await createEntry(admin, ws.id, project.id);
	}
	expect((await createEntry(admin, ws.id, project.id)).status).toBe(429);

	// A different user still has their own quota.
	expect((await createEntry(member, ws.id, project.id)).status).toBe(201);
});

it("buckets PAT credentials per token, not per user", async () => {
	const { admin, ws, project } = await setup();
	const patA = await createPat(admin);
	const patB = await createPat(admin);

	// Exhaust one token's bucket.
	for (let i = 0; i < TEST_LIMIT; i++) {
		expect((await createEntryWithToken(patA, ws.id, project.id)).status).toBe(
			201,
		);
	}
	expect((await createEntryWithToken(patA, ws.id, project.id)).status).toBe(
		429,
	);

	// The same user's *other* token has its own bucket (per-token keying).
	expect((await createEntryWithToken(patB, ws.id, project.id)).status).toBe(
		201,
	);
});

it("buckets agent access tokens per token", async () => {
	const { admin, ws, project } = await setup();
	// Agent ingest is gated behind the instance agents feature.
	await apiJson(
		"PATCH",
		"/api/v1/instance/agents",
		{ agentsEnabled: true },
		admin,
	);
	const tokenA = await createAgentToken(admin, ws.id, project.id);
	const tokenB = await createAgentToken(admin, ws.id, project.id);

	// Exhaust one agent token's bucket (distinct sessionIds, but the request is
	// rate-limited before the idempotent upsert regardless).
	for (let i = 0; i < TEST_LIMIT; i++) {
		expect((await ingestAgentEntry(tokenA, `a${i}`)).status).toBe(200);
	}
	expect((await ingestAgentEntry(tokenA, "a-over")).status).toBe(429);

	// A second agent token (same owner) keeps its own quota.
	expect((await ingestAgentEntry(tokenB, "b0")).status).toBe(200);
});
