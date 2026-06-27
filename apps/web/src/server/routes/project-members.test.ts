import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

import {
	apiGet,
	apiJson,
	defaultTemplateId,
	signUpUser,
} from "../../../test/helpers";

/**
 * Project membership ACL (docs/permissions.md, Gap D). A project's entries are
 * readable only by its members, plus workspace admins/owners and an entry's own
 * author. Project metadata stays workspace-visible.
 */

async function userId(cookie: string): Promise<string> {
	const me = (await (await apiGet("/api/v1/me", cookie)).json()) as {
		user: { id: string };
	};
	return me.user.id;
}

async function setup() {
	// First signup is the bootstrap instance admin; also the workspace owner.
	const owner = await signUpUser("Owner", "owner@example.com");
	const alice = await signUpUser("Alice", "alice@example.com");
	const bob = await signUpUser("Bob", "bob@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme" },
			owner,
		)
	).json()) as { id: string };
	for (const email of ["alice@example.com", "bob@example.com"]) {
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/members`,
			{ email },
			owner,
		);
	}
	const aliceId = await userId(alice);
	const bobId = await userId(bob);
	// projectA is Alice's, projectB is Bob's.
	const projectA = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "alpha", name: "Alpha", memberUserIds: [aliceId] },
			owner,
		)
	).json()) as { id: string };
	const projectB = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "beta", name: "Beta", memberUserIds: [bobId] },
			owner,
		)
	).json()) as { id: string };
	return { owner, alice, bob, aliceId, bobId, ws, projectA, projectB };
}

const logEntry = (
	cookie: string,
	wsId: string,
	projectId: string,
	minutes: number,
) =>
	apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: wsId,
			projectId,
			durationMinutes: minutes,
			description: "x",
		},
		cookie,
	);

it("scopes work-entry reads to project members, the author, and admins", async () => {
	const { owner, alice, bob, ws, projectA, projectB } = await setup();
	expect((await logEntry(alice, ws.id, projectA.id, 30)).status).toBe(201);
	expect((await logEntry(bob, ws.id, projectB.id, 45)).status).toBe(201);

	const list = async (cookie: string) =>
		(await (
			await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}`, cookie)
		).json()) as Array<{ projectId: string }>;

	// Each member sees only their own project's entries.
	expect((await list(alice)).map((e) => e.projectId)).toEqual([projectA.id]);
	expect((await list(bob)).map((e) => e.projectId)).toEqual([projectB.id]);
	// The workspace owner (admin) sees every project's entries.
	expect((await list(owner)).map((e) => e.projectId).sort()).toEqual(
		[projectA.id, projectB.id].sort(),
	);

	// Stats follow the same scope.
	const aliceStats = (await (
		await apiGet(`/api/v1/work-entries/stats?workspaceId=${ws.id}`, alice)
	).json()) as { totalMinutes: number };
	expect(aliceStats.totalMinutes).toBe(30);
});

it("hides a non-member's project entry by id (404, not 403)", async () => {
	const { alice, bob, ws, projectB } = await setup();
	const entry = (await (
		await logEntry(bob, ws.id, projectB.id, 45)
	).json()) as {
		id: string;
	};
	expect((await apiGet(`/api/v1/work-entries/${entry.id}`, alice)).status).toBe(
		404,
	);
	expect((await apiGet(`/api/v1/work-entries/${entry.id}`, bob)).status).toBe(
		200,
	);
});

it("blocks logging work to a project the caller does not belong to", async () => {
	const { alice, ws, projectB } = await setup();
	// Alice is not a member of projectB.
	expect((await logEntry(alice, ws.id, projectB.id, 15)).status).toBe(403);
});

it("makes unassigned entries visible to every workspace member", async () => {
	const { owner, alice, ws, projectA } = await setup();
	const entry = (await (
		await logEntry(owner, ws.id, projectA.id, 60)
	).json()) as { id: string };
	// Deleting the project orphans the entry (projectId → null).
	await apiJson(
		"PATCH",
		`/api/v1/projects/${projectA.id}`,
		{ status: "archived" },
		owner,
	);
	await apiJson("DELETE", `/api/v1/projects/${projectA.id}`, undefined, owner);
	// Alice (never a member of any surviving project) now sees the orphaned entry.
	const list = (await (
		await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}`, alice)
	).json()) as Array<{ id: string; projectId: string | null }>;
	expect(list.map((e) => e.id)).toEqual([entry.id]);
	expect(list[0]?.projectId).toBeNull();
});

it("still lets an author edit their own entry after leaving the project", async () => {
	const { owner, alice, aliceId, ws, projectA, projectB } = await setup();
	// Bob owns projectB; add Alice too so she has somewhere to (fail to) reassign.
	const entry = (await (
		await logEntry(alice, ws.id, projectA.id, 30)
	).json()) as { id: string };
	// Owner removes Alice from projectA.
	await apiJson(
		"DELETE",
		`/api/v1/projects/${projectA.id}/members/${aliceId}`,
		undefined,
		owner,
	);

	// Editing other fields with the project unchanged stays allowed.
	const edit = await apiJson(
		"PATCH",
		`/api/v1/work-entries/${entry.id}`,
		{ projectId: projectA.id, note: "still mine" },
		alice,
	);
	expect(edit.status).toBe(200);

	// But reassigning to a project she is not a member of is rejected.
	const reassign = await apiJson(
		"PATCH",
		`/api/v1/work-entries/${entry.id}`,
		{ projectId: projectB.id },
		alice,
	);
	expect(reassign.status).toBe(403);
});

it("excludes non-member project entries from a report render", async () => {
	const { alice, bob, ws, projectA, projectB } = await setup();
	await logEntry(alice, ws.id, projectA.id, 30);
	await logEntry(bob, ws.id, projectB.id, 45);

	// Alice's report scopes the whole workspace but only sees projectA.
	const preview = (await (
		await apiJson(
			"POST",
			"/api/v1/reports/preview",
			{
				name: "Daily",
				templateId: await defaultTemplateId(alice),
				filters: { workspaceIds: [ws.id], dateRange: "today" },
			},
			alice,
		)
	).json()) as { totalMinutes: number; entryCount: number };
	expect(preview.totalMinutes).toBe(30);
	expect(preview.entryCount).toBe(1);
});

it("restricts report recipients to those who can read the snapshot's projects", async () => {
	const { owner, alice, bobId, ws, projectA } = await setup();
	const ownerId = await userId(owner);
	await logEntry(alice, ws.id, projectA.id, 30);
	// Alice's whole-workspace report snapshot contains only projectA's entry.
	const report = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{
				name: "Daily",
				templateId: await defaultTemplateId(alice),
				filters: { workspaceIds: [ws.id], dateRange: "today" },
			},
			alice,
		)
	).json()) as { id: string };

	// Bob is a workspace member but only in projectB, so he cannot receive it; the
	// workspace owner (admin) can.
	const recipients = (await (
		await apiGet(`/api/v1/reports/${report.id}/recipients`, alice)
	).json()) as Array<{ id: string }>;
	expect(recipients.map((r) => r.id)).toContain(ownerId);
	expect(recipients.map((r) => r.id)).not.toContain(bobId);

	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/reports/${report.id}/send`,
				{ recipientUserIds: [bobId] },
				alice,
			)
		).status,
	).toBe(400);
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/reports/${report.id}/send`,
				{ recipientUserIds: [ownerId] },
				alice,
			)
		).status,
	).toBe(201);
});

it("blocks Send-to for a legacy report with unknown snapshot scope", async () => {
	const { alice, ws, projectA } = await setup();
	await logEntry(alice, ws.id, projectA.id, 30);
	const report = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{
				name: "Daily",
				templateId: await defaultTemplateId(alice),
				filters: { workspaceIds: [ws.id], dateRange: "today" },
			},
			alice,
		)
	).json()) as { id: string };
	// Simulate a report rendered before snapshot capture existed.
	await env.DB.prepare(
		"update reports set snapshot_project_ids = null where id = ?",
	)
		.bind(report.id)
		.run();

	// No one is eligible until the report is re-rendered.
	const recipients = (await (
		await apiGet(`/api/v1/reports/${report.id}/recipients`, alice)
	).json()) as unknown[];
	expect(recipients).toHaveLength(0);
});

it("lets admins manage members and members view the list", async () => {
	const { owner, alice, bob, aliceId, bobId, ws, projectA } = await setup();

	// A member can view the project's member list.
	const before = (await (
		await apiGet(`/api/v1/projects/${projectA.id}/members`, alice)
	).json()) as Array<{ userId: string }>;
	expect(before.map((m) => m.userId)).toEqual([aliceId]);

	// A non-admin cannot add members.
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/projects/${projectA.id}/members`,
				{ userId: bobId },
				alice,
			)
		).status,
	).toBe(403);

	// The owner can.
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/projects/${projectA.id}/members`,
				{ userId: bobId },
				owner,
			)
		).status,
	).toBe(201);
	// Bob can now read projectA's entries.
	await logEntry(alice, ws.id, projectA.id, 30);
	const list = (await (
		await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}`, bob)
	).json()) as unknown[];
	expect(list).toHaveLength(1);

	// Removing works; the owner then drops back out.
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/projects/${projectA.id}/members/${bobId}`,
				undefined,
				owner,
			)
		).status,
	).toBe(204);
});

it("rejects adding a non-workspace user as a project member", async () => {
	const { owner, projectA } = await setup();
	const outsider = await signUpUser("Outsider", "outsider@example.com");
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/projects/${projectA.id}/members`,
				{ userId: await userId(outsider) },
				owner,
			)
		).status,
	).toBe(400);
});

it("drops project memberships when a user leaves the workspace", async () => {
	const { owner, aliceId, ws, projectA } = await setup();
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/workspaces/${ws.id}/members/${aliceId}`,
				undefined,
				owner,
			)
		).status,
	).toBe(204);
	// Re-add Alice to the workspace; she is no longer in projectA.
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "alice@example.com" },
		owner,
	);
	const members = (await (
		await apiGet(`/api/v1/projects/${projectA.id}/members`, owner)
	).json()) as Array<{ userId: string }>;
	expect(members.map((m) => m.userId)).not.toContain(aliceId);
});

it("returns the caller's own project ids for the entry picker", async () => {
	const { alice, ws, projectA } = await setup();
	const mine = (await (
		await apiGet(`/api/v1/workspaces/${ws.id}/projects/mine`, alice)
	).json()) as string[];
	expect(mine).toEqual([projectA.id]);
});

it("exposes project members for the workspace avatar stacks", async () => {
	const { owner, aliceId, bobId, ws, projectA, projectB } = await setup();
	const rows = (await (
		await apiGet(`/api/v1/workspaces/${ws.id}/projects/members`, owner)
	).json()) as Array<{ projectId: string; userId: string }>;
	expect(rows).toContainEqual(
		expect.objectContaining({ projectId: projectA.id, userId: aliceId }),
	);
	expect(rows).toContainEqual(
		expect.objectContaining({ projectId: projectB.id, userId: bobId }),
	);
});
