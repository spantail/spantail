import { todayInTimezone } from "@toxil/core";
import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

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
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "toxil", name: "Toxil" },
			admin,
		)
	).json()) as { id: string };
	return { admin, member, ws, project };
}

it("creates an entry defaulting the date to today in the workspace timezone", async () => {
	const { admin, ws, project } = await setup();

	const res = await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws.id,
			projectId: project.id,
			durationMinutes: 90,
			description: "Implemented the API",
			tags: ["api"],
		},
		admin,
	);
	expect(res.status).toBe(201);
	const entry = (await res.json()) as { entryDate: string; tags: string[] };
	expect(entry.entryDate).toBe(todayInTimezone("Asia/Tokyo"));
	expect(entry.tags).toEqual(["api"]);
});

it("rejects projects from another workspace", async () => {
	const { admin, ws } = await setup();
	const otherWs = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "other", name: "Other", timezone: "UTC" },
			admin,
		)
	).json()) as { id: string };
	const foreignProject = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${otherWs.id}/projects`,
			{ slug: "p", name: "P" },
			admin,
		)
	).json()) as { id: string };

	const res = await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws.id,
			projectId: foreignProject.id,
			durationMinutes: 30,
			description: "x",
		},
		admin,
	);
	expect(res.status).toBe(400);
});

it("filters the list by project, user, and date range", async () => {
	const { admin, member, ws, project } = await setup();
	const mk = (cookie: string, date: string, description: string) =>
		apiJson(
			"POST",
			"/api/v1/work-entries",
			{
				workspaceId: ws.id,
				projectId: project.id,
				entryDate: date,
				durationMinutes: 60,
				description,
			},
			cookie,
		);
	await mk(admin, "2026-06-01", "a1");
	await mk(admin, "2026-06-10", "a2");
	await mk(member, "2026-06-10", "m1");

	const all = (await (
		await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}`, member)
	).json()) as unknown[];
	expect(all).toHaveLength(3);

	const ranged = (await (
		await apiGet(
			`/api/v1/work-entries?workspaceId=${ws.id}&from=2026-06-05&to=2026-06-30`,
			admin,
		)
	).json()) as Array<{ description: string }>;
	expect(ranged).toHaveLength(2);

	const me = (await (
		await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}&limit=1`, admin)
	).json()) as unknown[];
	expect(me).toHaveLength(1);
});

it("lets only the author update or delete an entry", async () => {
	const { admin, member, ws, project } = await setup();
	const entry = (await (
		await apiJson(
			"POST",
			"/api/v1/work-entries",
			{
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 30,
				description: "mine",
			},
			member,
		)
	).json()) as { id: string };

	// Other members can read but not modify.
	expect((await apiGet(`/api/v1/work-entries/${entry.id}`, admin)).status).toBe(
		200,
	);
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/work-entries/${entry.id}`,
				{ durationMinutes: 1 },
				admin,
			)
		).status,
	).toBe(403);

	const patched = await apiJson(
		"PATCH",
		`/api/v1/work-entries/${entry.id}`,
		{ durationMinutes: 45, note: "added a note" },
		member,
	);
	expect(patched.status).toBe(200);
	const body = (await patched.json()) as {
		durationMinutes: number;
		note: string;
	};
	expect(body.durationMinutes).toBe(45);
	expect(body.note).toBe("added a note");

	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/work-entries/${entry.id}`,
				undefined,
				admin,
			)
		).status,
	).toBe(403);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/work-entries/${entry.id}`,
				undefined,
				member,
			)
		).status,
	).toBe(204);
	expect(
		(await apiGet(`/api/v1/work-entries/${entry.id}`, member)).status,
	).toBe(404);
});

async function setupStats() {
	const ctx = await setup();
	const p2 = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ctx.ws.id}/projects`,
			{ slug: "ops", name: "Ops" },
			ctx.admin,
		)
	).json()) as { id: string };
	const userId = async (cookie: string) => {
		const me = (await (await apiGet("/api/v1/me", cookie)).json()) as {
			user: { id: string };
		};
		return me.user.id;
	};
	const mk = (
		cookie: string,
		projectId: string,
		date: string,
		minutes: number,
	) =>
		apiJson(
			"POST",
			"/api/v1/work-entries",
			{
				workspaceId: ctx.ws.id,
				projectId,
				entryDate: date,
				durationMinutes: minutes,
				description: "x",
			},
			cookie,
		);
	await mk(ctx.admin, ctx.project.id, "2026-06-01", 60);
	await mk(ctx.admin, p2.id, "2026-06-02", 30);
	await mk(ctx.member, ctx.project.id, "2026-06-02", 45);
	return {
		...ctx,
		p2,
		adminId: await userId(ctx.admin),
		memberId: await userId(ctx.member),
	};
}

type Stats = {
	totalMinutes: number;
	entryCount: number;
	byDate: Array<{ date: string; minutes: number; count: number }>;
	byProject: Array<{ projectId: string; minutes: number; count: number }>;
	byUser: Array<{ userId: string; minutes: number; count: number }>;
};

const getStats = async (query: string, cookie: string) =>
	(await (
		await apiGet(`/api/v1/work-entries/stats?${query}`, cookie)
	).json()) as Stats;

it("aggregates totals, by-date, by-project, and by-user stats", async () => {
	const { admin, ws, project, p2, adminId, memberId } = await setupStats();

	// Also proves "/stats" is not captured by the "/:id" route.
	const stats = await getStats(`workspaceId=${ws.id}`, admin);
	expect(stats.totalMinutes).toBe(135);
	expect(stats.entryCount).toBe(3);
	expect(stats.byDate).toEqual([
		{ date: "2026-06-01", minutes: 60, count: 1 },
		{ date: "2026-06-02", minutes: 75, count: 2 },
	]);
	expect(stats.byProject).toEqual([
		{ projectId: project.id, minutes: 105, count: 2 },
		{ projectId: p2.id, minutes: 30, count: 1 },
	]);
	expect(stats.byUser).toEqual([
		{ userId: adminId, minutes: 90, count: 2 },
		{ userId: memberId, minutes: 45, count: 1 },
	]);
});

it("filters stats by user and project", async () => {
	const { admin, member, ws, project, p2, adminId, memberId } =
		await setupStats();

	const mine = await getStats(`workspaceId=${ws.id}&userId=${adminId}`, member);
	expect(mine.totalMinutes).toBe(90);
	expect(mine.entryCount).toBe(2);
	expect(mine.byProject).toEqual([
		{ projectId: project.id, minutes: 60, count: 1 },
		{ projectId: p2.id, minutes: 30, count: 1 },
	]);

	const p1 = await getStats(
		`workspaceId=${ws.id}&projectId=${project.id}`,
		admin,
	);
	expect(p1.totalMinutes).toBe(105);
	expect(p1.byUser).toEqual([
		{ userId: adminId, minutes: 60, count: 1 },
		{ userId: memberId, minutes: 45, count: 1 },
	]);
});

it("applies inclusive from and to boundaries to stats", async () => {
	const { admin, ws } = await setupStats();

	const second = await getStats(
		`workspaceId=${ws.id}&from=2026-06-02&to=2026-06-02`,
		admin,
	);
	expect(second.totalMinutes).toBe(75);
	expect(second.entryCount).toBe(2);

	const first = await getStats(
		`workspaceId=${ws.id}&from=2026-06-01&to=2026-06-01`,
		admin,
	);
	expect(first.totalMinutes).toBe(60);
	expect(first.entryCount).toBe(1);
});

it("returns zeroed stats for an empty range", async () => {
	const { admin, ws } = await setupStats();
	const stats = await getStats(
		`workspaceId=${ws.id}&from=2030-01-01&to=2030-01-02`,
		admin,
	);
	expect(stats).toEqual({
		totalMinutes: 0,
		entryCount: 0,
		byDate: [],
		byProject: [],
		byUser: [],
	});
});

it("rejects invalid stats queries", async () => {
	const { admin, ws } = await setup();
	expect((await apiGet("/api/v1/work-entries/stats", admin)).status).toBe(400);
	expect(
		(
			await apiGet(
				`/api/v1/work-entries/stats?workspaceId=${ws.id}&from=2026-13-40`,
				admin,
			)
		).status,
	).toBe(400);
});

it("denies anonymous and non-member stats access", async () => {
	const { ws } = await setup();
	expect(
		(await apiGet(`/api/v1/work-entries/stats?workspaceId=${ws.id}`)).status,
	).toBe(401);
	const outsider = await signUpUser("Outsider2", "out2@example.com");
	expect(
		(await apiGet(`/api/v1/work-entries/stats?workspaceId=${ws.id}`, outsider))
			.status,
	).toBe(404);
});

it("denies anonymous and non-member access", async () => {
	const { admin, ws } = await setup();
	expect(
		(await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}`)).status,
	).toBe(401);

	const outsider = await signUpUser("Outsider", "out@example.com");
	expect(
		(await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}`, outsider))
			.status,
	).toBe(404);
	void admin;
});
