import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

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
