import { env } from "cloudflare:workers";
import { generatePat, hashPat, isShareTokenFormat } from "@toxil/core";
import { createApiToken, createDb } from "@toxil/db";
import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const other = await signUpUser("Other", "other@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			admin,
		)
	).json()) as { id: string };
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "toxil", name: "Toxil" },
			admin,
		)
	).json()) as { id: string };
	return { admin, other, ws, project };
}

/** Creates an entry + report and runs it; returns the snapshot id. */
async function createSnapshot(
	cookie: string,
	wsId: string,
	projectId: string,
): Promise<string> {
	const entry = await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: wsId,
			projectId,
			durationMinutes: 30,
			description: "Wired the share endpoint",
		},
		cookie,
	);
	expect(entry.status).toBe(201);
	const report = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{
				name: "Daily",
				templateId: "builtin:daily",
				filters: { workspaceIds: [wsId], dateRange: "today" },
			},
			cookie,
		)
	).json()) as { id: string };
	const run = await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/run`,
		undefined,
		cookie,
	);
	expect(run.status).toBe(201);
	return ((await run.json()) as { id: string }).id;
}

async function mintToken(
	cookie: string,
	scopes: Array<"read" | "write">,
): Promise<string> {
	const me = (await (await apiGet("/api/v1/me", cookie)).json()) as {
		user: { id: string };
	};
	const token = generatePat();
	await createApiToken(createDb(env.DB), {
		userId: me.user.id,
		name: "test",
		tokenHash: await hashPat(token),
		scopes,
		expiresAt: null,
	});
	return token;
}

it("creates and lists shares without exposing the passcode hash", async () => {
	const { admin, ws, project } = await setup();
	const snapshotId = await createSnapshot(admin, ws.id, project.id);

	const created = await apiJson(
		"POST",
		`/api/v1/report-snapshots/${snapshotId}/shares`,
		{ expiresInDays: 7, passcode: "open sesame" },
		admin,
	);
	expect(created.status).toBe(201);
	const share = (await created.json()) as Record<string, unknown>;
	expect(isShareTokenFormat(share.token as string)).toBe(true);
	expect(share.hasPasscode).toBe(true);
	expect(share).not.toHaveProperty("passcodeHash");
	const expiresAt = new Date(share.expiresAt as string).getTime();
	expect(expiresAt).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
	expect(expiresAt).toBeLessThan(Date.now() + 8 * 24 * 60 * 60 * 1000);

	// A body-less POST is fine: every field is optional.
	const bare = await appFetch(`/api/v1/report-snapshots/${snapshotId}/shares`, {
		method: "POST",
		headers: { cookie: admin },
	});
	expect(bare.status).toBe(201);
	const bareShare = (await bare.json()) as Record<string, unknown>;
	expect(bareShare.hasPasscode).toBe(false);
	expect(bareShare.expiresAt).toBeNull();

	const list = (await (
		await apiGet(`/api/v1/report-snapshots/${snapshotId}/shares`, admin)
	).json()) as Array<Record<string, unknown>>;
	expect(list).toHaveLength(2);
	for (const row of list) {
		expect(row).not.toHaveProperty("passcodeHash");
		expect(row.viewCount).toBe(0);
	}
});

it("validates share inputs", async () => {
	const { admin, ws, project } = await setup();
	const snapshotId = await createSnapshot(admin, ws.id, project.id);

	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/report-snapshots/${snapshotId}/shares`,
				{ expiresInDays: 0 },
				admin,
			)
		).status,
	).toBe(400);
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/report-snapshots/${snapshotId}/shares`,
				{ passcode: "abc" },
				admin,
			)
		).status,
	).toBe(400);

	// A present but malformed body must not silently mint a no-expiry link.
	const malformed = await appFetch(
		`/api/v1/report-snapshots/${snapshotId}/shares`,
		{
			method: "POST",
			headers: { "content-type": "application/json", cookie: admin },
			body: "{not json",
		},
	);
	expect(malformed.status).toBe(400);
});

it("hides shares from non-owners", async () => {
	const { admin, other, ws, project } = await setup();
	const snapshotId = await createSnapshot(admin, ws.id, project.id);
	const share = (await (
		await apiJson(
			"POST",
			`/api/v1/report-snapshots/${snapshotId}/shares`,
			{},
			admin,
		)
	).json()) as { id: string };

	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/report-snapshots/${snapshotId}/shares`,
				{},
				other,
			)
		).status,
	).toBe(404);
	expect(
		(await apiGet(`/api/v1/report-snapshots/${snapshotId}/shares`, other))
			.status,
	).toBe(404);
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/report-shares/${share.id}/revoke`,
				undefined,
				other,
			)
		).status,
	).toBe(404);
});

it("enforces PAT scopes on share management", async () => {
	const { admin, ws, project } = await setup();
	const snapshotId = await createSnapshot(admin, ws.id, project.id);
	const readToken = await mintToken(admin, ["read"]);
	const writeToken = await mintToken(admin, ["read", "write"]);

	const denied = await appFetch(
		`/api/v1/report-snapshots/${snapshotId}/shares`,
		{ method: "POST", headers: { authorization: `Bearer ${readToken}` } },
	);
	expect(denied.status).toBe(403);
	expect(
		((await denied.json()) as { error: { code: string } }).error.code,
	).toBe("insufficient_scope");

	expect(
		(
			await appFetch(`/api/v1/report-snapshots/${snapshotId}/shares`, {
				headers: { authorization: `Bearer ${readToken}` },
			})
		).status,
	).toBe(200);
	expect(
		(
			await appFetch(`/api/v1/report-snapshots/${snapshotId}/shares`, {
				method: "POST",
				headers: { authorization: `Bearer ${writeToken}` },
			})
		).status,
	).toBe(201);
});

it("blocks create and list after membership loss but still allows revoke", async () => {
	const { admin, other, ws, project } = await setup();
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "other@example.com" },
		admin,
	);
	const snapshotId = await createSnapshot(other, ws.id, project.id);
	const share = (await (
		await apiJson(
			"POST",
			`/api/v1/report-snapshots/${snapshotId}/shares`,
			{},
			other,
		)
	).json()) as { id: string };

	const me = (await (await apiGet("/api/v1/me", other)).json()) as {
		user: { id: string };
	};
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/workspaces/${ws.id}/members/${me.user.id}`,
				undefined,
				admin,
			)
		).status,
	).toBe(204);

	// Tokens are content capabilities: with the membership gone, neither
	// minting new links nor reading existing ones is allowed.
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/report-snapshots/${snapshotId}/shares`,
				{},
				other,
			)
		).status,
	).toBe(403);
	expect(
		(await apiGet(`/api/v1/report-snapshots/${snapshotId}/shares`, other))
			.status,
	).toBe(403);
	// Revoking only reduces exposure, so it still works.
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/report-shares/${share.id}/revoke`,
				undefined,
				other,
			)
		).status,
	).toBe(200);
});

it("revokes idempotently, keeping the first timestamp", async () => {
	const { admin, ws, project } = await setup();
	const snapshotId = await createSnapshot(admin, ws.id, project.id);
	const share = (await (
		await apiJson(
			"POST",
			`/api/v1/report-snapshots/${snapshotId}/shares`,
			{},
			admin,
		)
	).json()) as { id: string };

	const first = await apiJson(
		"POST",
		`/api/v1/report-shares/${share.id}/revoke`,
		undefined,
		admin,
	);
	expect(first.status).toBe(200);
	const revokedAt = ((await first.json()) as { revokedAt: string }).revokedAt;
	expect(revokedAt).toBeTruthy();

	const second = await apiJson(
		"POST",
		`/api/v1/report-shares/${share.id}/revoke`,
		undefined,
		admin,
	);
	expect(second.status).toBe(200);
	expect(((await second.json()) as { revokedAt: string }).revokedAt).toBe(
		revokedAt,
	);
});

it("cascades share deletion with the snapshot", async () => {
	const { admin, ws, project } = await setup();
	const snapshotId = await createSnapshot(admin, ws.id, project.id);
	const share = (await (
		await apiJson(
			"POST",
			`/api/v1/report-snapshots/${snapshotId}/shares`,
			{},
			admin,
		)
	).json()) as { id: string };

	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/report-snapshots/${snapshotId}`,
				undefined,
				admin,
			)
		).status,
	).toBe(204);
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/report-shares/${share.id}/revoke`,
				undefined,
				admin,
			)
		).status,
	).toBe(404);
});
