import { todayInTimezone } from "@spantail/core";
import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

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
			{ slug: "spantail", name: "Spantail" },
			admin,
		)
	).json()) as { id: string };
	return { admin, member, ws, project };
}

it("creates an span defaulting the date to today in the workspace timezone", async () => {
	const { admin, ws, project } = await setup();

	const res = await apiJson(
		"POST",
		"/api/v1/work-spans",
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
	const span = (await res.json()) as { spanDate: string; tags: string[] };
	expect(span.spanDate).toBe(todayInTimezone("Asia/Tokyo"));
	expect(span.tags).toEqual(["api"]);
});

it("records the source from the auth channel and X-Spantail-Client hint", async () => {
	const { admin, ws, project } = await setup();

	// A session caller is the web SPA.
	const viaSession = (await (
		await apiJson(
			"POST",
			"/api/v1/work-spans",
			{
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 30,
				description: "from the web",
			},
			admin,
		)
	).json()) as { source: string };
	expect(viaSession.source).toBe("web");

	// A write-scoped PAT stands in for the programmatic channels.
	const { token } = (await (
		await apiJson(
			"POST",
			"/api/v1/tokens",
			{ name: "dev", scopes: ["read", "write"] },
			admin,
		)
	).json()) as { token: string };

	const sourceFor = async (client?: string) => {
		const res = await appFetch("/api/v1/work-spans", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${token}`,
				...(client ? { "x-spantail-client": client } : {}),
			},
			body: JSON.stringify({
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 30,
				description: "programmatic",
			}),
		});
		expect(res.status).toBe(201);
		return ((await res.json()) as { source: string }).source;
	};

	expect(await sourceFor("cli")).toBe("cli");
	expect(await sourceFor("mcp")).toBe("mcp");
	// A bare PAT (e.g. curl) and any unrecognized hint default to "api".
	expect(await sourceFor()).toBe("api");
	expect(await sourceFor("bogus")).toBe("api");
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
		"/api/v1/work-spans",
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
			"/api/v1/work-spans",
			{
				workspaceId: ws.id,
				projectId: project.id,
				spanDate: date,
				durationMinutes: 60,
				description,
			},
			cookie,
		);
	await mk(admin, "2026-06-01", "a1");
	await mk(admin, "2026-06-10", "a2");
	await mk(member, "2026-06-10", "m1");

	const all = (await (
		await apiGet(`/api/v1/work-spans?workspaceId=${ws.id}`, member)
	).json()) as unknown[];
	expect(all).toHaveLength(3);

	const ranged = (await (
		await apiGet(
			`/api/v1/work-spans?workspaceId=${ws.id}&from=2026-06-05&to=2026-06-30`,
			admin,
		)
	).json()) as Array<{ description: string }>;
	expect(ranged).toHaveLength(2);

	const me = (await (
		await apiGet(`/api/v1/work-spans?workspaceId=${ws.id}&limit=1`, admin)
	).json()) as unknown[];
	expect(me).toHaveLength(1);
});

it("filters the list by tag", async () => {
	const { admin, ws, project } = await setup();
	const mk = (description: string, tags: string[]) =>
		apiJson(
			"POST",
			"/api/v1/work-spans",
			{
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 60,
				description,
				tags,
			},
			admin,
		);
	await mk("a1", ["api", "bug"]);
	await mk("a2", ["design"]);
	await mk("a3", []);

	const bug = (await (
		await apiGet(`/api/v1/work-spans?workspaceId=${ws.id}&tag=bug`, admin)
	).json()) as Array<{ description: string }>;
	expect(bug.map((e) => e.description)).toEqual(["a1"]);

	const design = (await (
		await apiGet(`/api/v1/work-spans?workspaceId=${ws.id}&tag=design`, admin)
	).json()) as unknown[];
	expect(design).toHaveLength(1);

	const none = (await (
		await apiGet(`/api/v1/work-spans?workspaceId=${ws.id}&tag=missing`, admin)
	).json()) as unknown[];
	expect(none).toHaveLength(0);
});

it("lists distinct tags in scope, sorted", async () => {
	const { admin, ws, project } = await setup();
	const other = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "ops", name: "Ops" },
			admin,
		)
	).json()) as { id: string };
	const mk = (projectId: string, tags: string[]) =>
		apiJson(
			"POST",
			"/api/v1/work-spans",
			{
				workspaceId: ws.id,
				projectId,
				durationMinutes: 30,
				description: "x",
				tags,
			},
			admin,
		);
	await mk(project.id, ["bug", "api"]);
	await mk(project.id, ["api"]);
	await mk(other.id, ["ops"]);

	// Workspace-wide: distinct and sorted across both projects.
	const all = (await (
		await apiGet(`/api/v1/work-spans/tags?workspaceId=${ws.id}`, admin)
	).json()) as string[];
	expect(all).toEqual(["api", "bug", "ops"]);

	// Project-scoped: only that project's tags. Also proves "/tags" is not
	// captured by the "/:id" route.
	const scoped = (await (
		await apiGet(
			`/api/v1/work-spans/tags?workspaceId=${ws.id}&projectId=${project.id}`,
			admin,
		)
	).json()) as string[];
	expect(scoped).toEqual(["api", "bug"]);
});

it("lets only the author update or delete an span", async () => {
	const { admin, member, ws, project } = await setup();
	const span = (await (
		await apiJson(
			"POST",
			"/api/v1/work-spans",
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
	expect((await apiGet(`/api/v1/work-spans/${span.id}`, admin)).status).toBe(
		200,
	);
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/work-spans/${span.id}`,
				{ durationMinutes: 1 },
				admin,
			)
		).status,
	).toBe(403);

	const patched = await apiJson(
		"PATCH",
		`/api/v1/work-spans/${span.id}`,
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
		(await apiJson("DELETE", `/api/v1/work-spans/${span.id}`, undefined, admin))
			.status,
	).toBe(403);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/work-spans/${span.id}`,
				undefined,
				member,
			)
		).status,
	).toBe(204);
	expect((await apiGet(`/api/v1/work-spans/${span.id}`, member)).status).toBe(
		404,
	);
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
			"/api/v1/work-spans",
			{
				workspaceId: ctx.ws.id,
				projectId,
				spanDate: date,
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
	spanCount: number;
	byDate: Array<{ date: string; minutes: number; count: number }>;
	byProject: Array<{ projectId: string; minutes: number; count: number }>;
	byUser: Array<{ userId: string; minutes: number; count: number }>;
};

const getStats = async (query: string, cookie: string) =>
	(await (
		await apiGet(`/api/v1/work-spans/stats?${query}`, cookie)
	).json()) as Stats;

it("aggregates totals, by-date, by-project, and by-user stats", async () => {
	const { admin, ws, project, p2, adminId, memberId } = await setupStats();

	// Also proves "/stats" is not captured by the "/:id" route.
	const stats = await getStats(`workspaceId=${ws.id}`, admin);
	expect(stats.totalMinutes).toBe(135);
	expect(stats.spanCount).toBe(3);
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
	expect(mine.spanCount).toBe(2);
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
	expect(second.spanCount).toBe(2);

	const first = await getStats(
		`workspaceId=${ws.id}&from=2026-06-01&to=2026-06-01`,
		admin,
	);
	expect(first.totalMinutes).toBe(60);
	expect(first.spanCount).toBe(1);
});

it("returns zeroed stats for an empty range", async () => {
	const { admin, ws } = await setupStats();
	const stats = await getStats(
		`workspaceId=${ws.id}&from=2030-01-01&to=2030-01-02`,
		admin,
	);
	expect(stats).toEqual({
		totalMinutes: 0,
		spanCount: 0,
		byDate: [],
		byProject: [],
		byUser: [],
	});
});

it("rejects invalid stats queries", async () => {
	const { admin, ws } = await setup();
	expect((await apiGet("/api/v1/work-spans/stats", admin)).status).toBe(400);
	expect(
		(
			await apiGet(
				`/api/v1/work-spans/stats?workspaceId=${ws.id}&from=2026-13-40`,
				admin,
			)
		).status,
	).toBe(400);
});

it("denies anonymous and non-member stats access", async () => {
	const { ws } = await setup();
	expect(
		(await apiGet(`/api/v1/work-spans/stats?workspaceId=${ws.id}`)).status,
	).toBe(401);
	const outsider = await signUpUser("Outsider2", "out2@example.com");
	expect(
		(await apiGet(`/api/v1/work-spans/stats?workspaceId=${ws.id}`, outsider))
			.status,
	).toBe(404);
});

it("denies anonymous and non-member access", async () => {
	const { admin, ws } = await setup();
	expect((await apiGet(`/api/v1/work-spans?workspaceId=${ws.id}`)).status).toBe(
		401,
	);

	const outsider = await signUpUser("Outsider", "out@example.com");
	expect(
		(await apiGet(`/api/v1/work-spans?workspaceId=${ws.id}`, outsider)).status,
	).toBe(404);
	void admin;
});

it("lets an span orphaned by project deletion be edited without a project", async () => {
	const { admin, ws, project } = await setup();
	const span = (await (
		await apiJson(
			"POST",
			"/api/v1/work-spans",
			{
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 60,
				description: "Original",
			},
			admin,
		)
	).json()) as { id: string };

	// Orphan the span: archive then delete its project.
	await apiJson(
		"PATCH",
		`/api/v1/projects/${project.id}`,
		{ status: "archived" },
		admin,
	);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/projects/${project.id}`,
				undefined,
				admin,
			)
		).status,
	).toBe(204);

	// Editing other fields while keeping projectId null succeeds.
	const updated = await apiJson(
		"PATCH",
		`/api/v1/work-spans/${span.id}`,
		{ projectId: null, description: "Edited while unassigned" },
		admin,
	);
	expect(updated.status).toBe(200);
	const body = (await updated.json()) as {
		projectId: string | null;
		description: string;
	};
	expect(body.projectId).toBeNull();
	expect(body.description).toBe("Edited while unassigned");
});

it("rejects unassigning a live span from its project", async () => {
	const { admin, ws, project } = await setup();
	const span = (await (
		await apiJson(
			"POST",
			"/api/v1/work-spans",
			{
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 30,
				description: "Live span",
			},
			admin,
		)
	).json()) as { id: string };

	// The project still exists, so nulling its project is not allowed.
	const res = await apiJson(
		"PATCH",
		`/api/v1/work-spans/${span.id}`,
		{ projectId: null },
		admin,
	);
	expect(res.status).toBe(400);
});
