import { env } from "cloudflare:workers";
import { todayInTimezone } from "@spantail/core";
import {
	createDb,
	createWorkEntriesBatch,
	getWorkEntryById,
	schema,
	WorkEntryOwnershipConflictError,
} from "@spantail/db";
import { expect, it } from "vitest";

import {
	apiGet,
	apiJson,
	appFetch,
	signUpAdmin,
	signUpUser,
} from "../../../test/helpers";

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
	return { admin, member, memberId, ws, project };
}

it("creates an entry defaulting the date to today in the author timezone", async () => {
	const { admin, ws, project } = await setup();
	// signUpUser leaves the timezone null (UTC fallback); pin the author to
	// Asia/Tokyo so the defaulted entry date and the assertion below both resolve
	// in the same zone off the same clock — otherwise the dates disagree whenever
	// the suite runs in the UTC window where Tokyo is already on the next day.
	await apiJson("PATCH", "/api/v1/me", { timezone: "Asia/Tokyo" }, admin);

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

it("records the source from the auth channel and X-Spantail-Client hint", async () => {
	const { admin, ws, project } = await setup();

	// A session caller is the web SPA.
	const viaSession = (await (
		await apiJson(
			"POST",
			"/api/v1/work-entries",
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
		const res = await appFetch("/api/v1/work-entries", {
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
			{ slug: "other", name: "Other" },
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

it("filters the list by tag", async () => {
	const { admin, ws, project } = await setup();
	const mk = (description: string, tags: string[]) =>
		apiJson(
			"POST",
			"/api/v1/work-entries",
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
		await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}&tag=bug`, admin)
	).json()) as Array<{ description: string }>;
	expect(bug.map((e) => e.description)).toEqual(["a1"]);

	const design = (await (
		await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}&tag=design`, admin)
	).json()) as unknown[];
	expect(design).toHaveLength(1);

	const none = (await (
		await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}&tag=missing`, admin)
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
			"/api/v1/work-entries",
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
		await apiGet(`/api/v1/work-entries/tags?workspaceId=${ws.id}`, admin)
	).json()) as string[];
	expect(all).toEqual(["api", "bug", "ops"]);

	// Project-scoped: only that project's tags. Also proves "/tags" is not
	// captured by the "/:id" route.
	const scoped = (await (
		await apiGet(
			`/api/v1/work-entries/tags?workspaceId=${ws.id}&projectId=${project.id}`,
			admin,
		)
	).json()) as string[];
	expect(scoped).toEqual(["api", "bug"]);
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
			{ slug: "ops", name: "Ops", memberUserIds: [ctx.memberId] },
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

it("lets an entry orphaned by project deletion be edited without a project", async () => {
	const { admin, ws, project } = await setup();
	const entry = (await (
		await apiJson(
			"POST",
			"/api/v1/work-entries",
			{
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 60,
				description: "Original",
			},
			admin,
		)
	).json()) as { id: string };

	// Orphan the entry: archive then delete its project.
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
		`/api/v1/work-entries/${entry.id}`,
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

// --- POST /work-entries/batch (bulk import) -------------------------------

type BatchEntry = {
	projectId: string;
	entryDate: string;
	durationMinutes: number;
	description: string;
	externalId?: string;
	note?: string;
	tags?: string[];
	startedAt?: string;
	endedAt?: string;
	user?: string;
};

const postBatch = (
	cookie: string,
	workspaceId: string,
	entries: BatchEntry[],
) =>
	apiJson(
		"POST",
		"/api/v1/work-entries/batch",
		{ workspaceId, entries },
		cookie,
	);

const listEntries = async (cookie: string, workspaceId: string) =>
	(await (
		await apiGet(
			`/api/v1/work-entries?workspaceId=${workspaceId}&limit=200`,
			cookie,
		)
	).json()) as Array<{
		id: string;
		description: string;
		entryDate: string;
		tags: string[];
		note: string | null;
	}>;

it("bulk-inserts entries across projects and insert chunks atomically", async () => {
	const { admin, ws, project } = await setup();
	const p2 = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "ops", name: "Ops" },
			admin,
		)
	).json()) as { id: string };

	// 20 entries cross the 8-row insert-chunk boundary (3 statements in one
	// D1 batch) and span two projects.
	const entries: BatchEntry[] = Array.from({ length: 20 }, (_, i) => ({
		projectId: i % 2 === 0 ? project.id : p2.id,
		entryDate: `2026-06-${String((i % 28) + 1).padStart(2, "0")}`,
		durationMinutes: 30 + i,
		description: `imported ${i}`,
		note: i === 0 ? "with a note" : undefined,
		tags: i === 0 ? ["migrated"] : undefined,
	}));
	const res = await postBatch(admin, ws.id, entries);
	expect(res.status).toBe(201);
	expect(await res.json()).toEqual({ count: 20 });

	const listed = await listEntries(admin, ws.id);
	expect(listed).toHaveLength(20);
	const first = listed.find((e) => e.description === "imported 0");
	expect(first?.tags).toEqual(["migrated"]);
	expect(first?.note).toBe("with a note");
});

// The size check runs before the body is parsed, so an oversized payload is a
// 413 rather than the 400 its over-long note would otherwise earn.
it("rejects an oversized batch body before parsing it", async () => {
	const { admin, ws, project } = await setup();
	const res = await postBatch(admin, ws.id, [
		{
			projectId: project.id,
			entryDate: "2026-06-01",
			durationMinutes: 60,
			description: "imported",
			note: "x".repeat(8 * 1024 * 1024),
		},
	]);
	expect(res.status).toBe(413);
	expect(await res.json()).toEqual({
		error: { code: "bad_request", message: "Payload too large" },
	});
});

it("upserts entries by externalId instead of duplicating", async () => {
	const { admin, ws, project } = await setup();
	const entries: BatchEntry[] = Array.from({ length: 10 }, (_, i) => ({
		projectId: project.id,
		entryDate: "2026-06-01",
		durationMinutes: 60,
		description: `v1 ${i}`,
		externalId: `legacy-${i}`,
	}));
	expect((await postBatch(admin, ws.id, entries)).status).toBe(201);

	// The externalId is the entry id, addressable directly.
	const before = await apiGet("/api/v1/work-entries/legacy-3", admin);
	expect(before.status).toBe(200);
	const beforeBody = (await before.json()) as {
		id: string;
		createdAt: string;
	};
	expect(beforeBody.id).toBe("legacy-3");

	// Re-send the same batch with changed content: same count, no duplicates,
	// content updated, identity preserved.
	const res = await postBatch(
		admin,
		ws.id,
		entries.map((e) => ({
			...e,
			description: e.description.replace("v1", "v2"),
		})),
	);
	expect(res.status).toBe(201);
	const listed = await listEntries(admin, ws.id);
	expect(listed).toHaveLength(10);
	expect(listed.every((e) => e.description.startsWith("v2"))).toBe(true);

	const after = (await (
		await apiGet("/api/v1/work-entries/legacy-3", admin)
	).json()) as { createdAt: string; description: string };
	expect(after.description).toBe("v2 3");
	expect(after.createdAt).toBe(beforeBody.createdAt);

	// Without an externalId a re-sent entry is a plain insert and duplicates.
	const plain: BatchEntry = {
		projectId: project.id,
		entryDate: "2026-06-02",
		durationMinutes: 15,
		description: "no id",
	};
	await postBatch(admin, ws.id, [plain]);
	await postBatch(admin, ws.id, [plain]);
	expect(
		(await listEntries(admin, ws.id)).filter((e) => e.description === "no id"),
	).toHaveLength(2);
});

it("rejects an externalId owned by another user or workspace with 409", async () => {
	const { admin, member, memberId, ws, project } = await setup();
	const mine: BatchEntry = {
		projectId: project.id,
		entryDate: "2026-06-01",
		durationMinutes: 30,
		description: "member's entry",
		externalId: "legacy-shared",
	};
	expect((await postBatch(member, ws.id, [mine])).status).toBe(201);

	// Another user in the same workspace cannot claim or overwrite that id;
	// the whole batch is rejected (atomic), including unrelated entries.
	const res = await postBatch(admin, ws.id, [
		{ ...mine, description: "hijack attempt" },
		{
			projectId: project.id,
			entryDate: "2026-06-02",
			durationMinutes: 10,
			description: "innocent bystander",
		},
	]);
	expect(res.status).toBe(409);
	const listed = await listEntries(admin, ws.id);
	expect(listed).toHaveLength(1);
	expect(listed[0]?.description).toBe("member's entry");

	// Same user, different workspace: the id is still taken.
	const otherWs = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "other", name: "Other" },
			admin,
		)
	).json()) as { id: string };
	await apiJson(
		"POST",
		`/api/v1/workspaces/${otherWs.id}/members`,
		{ email: "member@example.com" },
		admin,
	);
	const otherProject = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${otherWs.id}/projects`,
			{ slug: "p", name: "P", memberUserIds: [memberId] },
			admin,
		)
	).json()) as { id: string };
	expect(
		(
			await postBatch(member, otherWs.id, [
				{ ...mine, projectId: otherProject.id },
			])
		).status,
	).toBe(409);
});

it("rolls back the whole batch when a foreign-id conflict races past the pre-check", async () => {
	const { admin, member, ws, project } = await setup();
	const mine: BatchEntry = {
		projectId: project.id,
		entryDate: "2026-06-01",
		durationMinutes: 30,
		description: "member's entry",
		externalId: "legacy-raced",
	};
	expect((await postBatch(member, ws.id, [mine])).status).toBe(201);
	const adminId = (
		(await (await apiGet("/api/v1/me", admin)).json()) as {
			user: { id: string };
		}
	).user.id;

	// Call the query layer directly, standing in for a request that passed the
	// route's ownership pre-check before the member's insert committed. The
	// conflicting statement must fail the whole batch, not silently skip.
	const db = createDb(env.DB as D1Database);
	const row = (id: string, description: string) => ({
		id,
		workspaceId: ws.id,
		projectId: project.id,
		userId: adminId,
		entryDate: "2026-06-02",
		durationMinutes: 10,
		startedAt: null,
		endedAt: null,
		description,
		note: null,
		tags: [],
		source: "api" as const,
	});
	await expect(
		createWorkEntriesBatch(db, [
			row(crypto.randomUUID(), "innocent bystander"),
			row("legacy-raced", "hijack attempt"),
		]),
	).rejects.toBeInstanceOf(WorkEntryOwnershipConflictError);

	// Atomic: the member's entry is untouched and the bystander row rolled back.
	const listed = await listEntries(admin, ws.id);
	expect(listed).toHaveLength(1);
	expect(listed[0]?.description).toBe("member's entry");
});

it("rejects duplicate and malformed externalIds in one batch", async () => {
	const { admin, ws, project } = await setup();
	const entry = (externalId: string): BatchEntry => ({
		projectId: project.id,
		entryDate: "2026-06-01",
		durationMinutes: 30,
		description: "x",
		externalId,
	});
	expect(
		(await postBatch(admin, ws.id, [entry("dup"), entry("dup")])).status,
	).toBe(400);
	// Collection sub-routes are matched before /:id, and dot-segments normalize
	// away in URLs, so an entry with one of these ids could never be fetched.
	for (const reserved of ["stats", "tags", "batch", ".", ".."]) {
		expect((await postBatch(admin, ws.id, [entry(reserved)])).status).toBe(400);
	}
	expect((await postBatch(admin, ws.id, [entry("a/b")])).status).toBe(400);
	expect((await postBatch(admin, ws.id, [entry("a b")])).status).toBe(400);
	expect(await listEntries(admin, ws.id)).toHaveLength(0);
});

it("writes nothing when any batch entry is invalid", async () => {
	const { admin, ws, project } = await setup();
	const otherWs = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "other", name: "Other" },
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

	const good: BatchEntry[] = Array.from({ length: 19 }, (_, i) => ({
		projectId: project.id,
		entryDate: "2026-06-01",
		durationMinutes: 30,
		description: `ok ${i}`,
	}));

	// One project from another workspace poisons the whole batch.
	expect(
		(
			await postBatch(admin, ws.id, [
				...good,
				{ ...(good[0] as BatchEntry), projectId: foreignProject.id },
			])
		).status,
	).toBe(400);

	// entryDate is required per entry — no default-to-today in bulk.
	const missingDate = { ...(good[0] as BatchEntry) } as Record<string, unknown>;
	delete missingDate.entryDate;
	const res = await apiJson(
		"POST",
		"/api/v1/work-entries/batch",
		{ workspaceId: ws.id, entries: [...good, missingDate] },
		admin,
	);
	expect(res.status).toBe(400);

	expect(await listEntries(admin, ws.id)).toHaveLength(0);
});

it("bounds the batch size", async () => {
	const { admin, ws, project } = await setup();
	expect((await postBatch(admin, ws.id, [])).status).toBe(400);
	const tooMany: BatchEntry[] = Array.from({ length: 101 }, () => ({
		projectId: project.id,
		entryDate: "2026-06-01",
		durationMinutes: 1,
		description: "x",
	}));
	expect((await postBatch(admin, ws.id, tooMany)).status).toBe(400);
	expect(await listEntries(admin, ws.id)).toHaveLength(0);
});

it("enforces workspace membership, project access, and write scope on batch", async () => {
	const { admin, member, ws, project } = await setup();

	// Non-member: the workspace's existence is hidden.
	const outsider = await signUpUser("Outsider3", "out3@example.com");
	expect(
		(
			await postBatch(outsider, ws.id, [
				{
					projectId: project.id,
					entryDate: "2026-06-01",
					durationMinutes: 30,
					description: "x",
				},
			])
		).status,
	).toBe(404);

	// A member without access to one project in the batch: 403, nothing written.
	const restricted = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "private", name: "Private" },
			admin,
		)
	).json()) as { id: string };
	const res = await postBatch(member, ws.id, [
		{
			projectId: project.id,
			entryDate: "2026-06-01",
			durationMinutes: 30,
			description: "allowed",
		},
		{
			projectId: restricted.id,
			entryDate: "2026-06-01",
			durationMinutes: 30,
			description: "denied",
		},
	]);
	expect(res.status).toBe(403);
	expect(await listEntries(admin, ws.id)).toHaveLength(0);

	// A read-only token lacks the write scope.
	const { token } = (await (
		await apiJson(
			"POST",
			"/api/v1/tokens",
			{ name: "ro", scopes: ["read"] },
			admin,
		)
	).json()) as { token: string };
	const scoped = await appFetch("/api/v1/work-entries/batch", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			workspaceId: ws.id,
			entries: [
				{
					projectId: project.id,
					entryDate: "2026-06-01",
					durationMinutes: 30,
					description: "x",
				},
			],
		}),
	});
	expect(scoped.status).toBe(403);
});

it("lets an instance admin attribute imported entries to other users by email", async () => {
	const { admin, member, memberId, ws, project } = await setup();
	const adminId = (
		(await (await apiGet("/api/v1/me", admin)).json()) as {
			user: { id: string };
		}
	).user.id;

	const res = await postBatch(admin, ws.id, [
		{
			projectId: project.id,
			entryDate: "2026-06-01",
			durationMinutes: 30,
			description: "member's history",
			externalId: "for-member",
			user: "member@example.com",
		},
		{
			projectId: project.id,
			entryDate: "2026-06-01",
			durationMinutes: 30,
			description: "admin's own",
			externalId: "for-admin",
		},
	]);
	expect(res.status).toBe(201);

	// The named author owns their line; a line without `user` stays the caller's.
	const db = createDb(env.DB as D1Database);
	expect((await getWorkEntryById(db, "for-member"))?.userId).toBe(memberId);
	expect((await getWorkEntryById(db, "for-admin"))?.userId).toBe(adminId);

	// The member can reach their attributed entry as its author.
	const mine = await apiGet("/api/v1/work-entries/for-member", member);
	expect(mine.status).toBe(200);
});

it("rejects cross-user attribution from a non-admin, but allows self-attribution", async () => {
	const { admin, member, memberId, ws, project } = await setup();

	// A member naming someone else as author is forbidden — nothing written.
	const forbidden = await postBatch(member, ws.id, [
		{
			projectId: project.id,
			entryDate: "2026-06-01",
			durationMinutes: 30,
			description: "impersonation",
			user: "admin@example.com",
		},
	]);
	expect(forbidden.status).toBe(403);
	expect(await listEntries(admin, ws.id)).toHaveLength(0);

	// Naming yourself is a no-op and stays allowed.
	const ok = await postBatch(member, ws.id, [
		{
			projectId: project.id,
			entryDate: "2026-06-01",
			durationMinutes: 30,
			description: "my own",
			externalId: "self",
			user: "member@example.com",
		},
	]);
	expect(ok.status).toBe(201);
	const db = createDb(env.DB as D1Database);
	expect((await getWorkEntryById(db, "self"))?.userId).toBe(memberId);
});

it("fails up front when an author email is unknown or not a workspace member", async () => {
	const { admin, ws, project } = await setup();
	// An account outside the workspace exists but is not a member.
	await signUpUser("Outsider", "outsider@example.com");

	const entry = (email: string): BatchEntry => ({
		projectId: project.id,
		entryDate: "2026-06-01",
		durationMinutes: 30,
		description: "x",
		user: email,
	});

	// No such account.
	const unknown = await postBatch(admin, ws.id, [entry("ghost@example.com")]);
	expect(unknown.status).toBe(400);
	// Known account, but not a member of this workspace.
	const nonMember = await postBatch(admin, ws.id, [
		entry("outsider@example.com"),
	]);
	expect(nonMember.status).toBe(400);

	expect(await listEntries(admin, ws.id)).toHaveLength(0);
});

it("keeps admin cross-user import idempotent, but blocks re-owning an id", async () => {
	const { admin, memberId, ws, project } = await setup();
	const adminId = (
		(await (await apiGet("/api/v1/me", admin)).json()) as {
			user: { id: string };
		}
	).user.id;
	const forMember = (description: string): BatchEntry => ({
		projectId: project.id,
		entryDate: "2026-06-01",
		durationMinutes: 30,
		description,
		externalId: "legacy-1",
		user: "member@example.com",
	});

	expect((await postBatch(admin, ws.id, [forMember("v1")])).status).toBe(201);
	// Re-importing the same id for the same author updates in place.
	expect((await postBatch(admin, ws.id, [forMember("v2")])).status).toBe(201);
	const db = createDb(env.DB as D1Database);
	const row = await getWorkEntryById(db, "legacy-1");
	expect(row?.userId).toBe(memberId);
	expect(row?.description).toBe("v2");
	expect(await listEntries(admin, ws.id)).toHaveLength(1);

	// Re-attributing the same externalId to a different author conflicts.
	const reowned = await postBatch(admin, ws.id, [
		{
			projectId: project.id,
			entryDate: "2026-06-01",
			durationMinutes: 30,
			description: "steal",
			externalId: "legacy-1",
		},
	]);
	expect(reowned.status).toBe(409);
	// Unchanged: still the member's, still v2.
	const after = await getWorkEntryById(db, "legacy-1");
	expect(after?.userId).toBe(memberId);
	expect(after?.description).toBe("v2");
	expect(adminId).not.toBe(memberId);
});

it("rejects unassigning a live entry from its project", async () => {
	const { admin, ws, project } = await setup();
	const entry = (await (
		await apiJson(
			"POST",
			"/api/v1/work-entries",
			{
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 30,
				description: "Live entry",
			},
			admin,
		)
	).json()) as { id: string };

	// The project still exists, so nulling its project is not allowed.
	const res = await apiJson(
		"PATCH",
		`/api/v1/work-entries/${entry.id}`,
		{ projectId: null },
		admin,
	);
	expect(res.status).toBe(400);
});

// --- linking work entries to the agent entries they were logged from ---

async function setupWithAgentIngest() {
	const base = await setup();
	// The agents feature is off by default; the bootstrap admin enables it.
	await apiJson(
		"PATCH",
		"/api/v1/instance/agents",
		{ agentsEnabled: true },
		base.admin,
	);
	return {
		...base,
		// Registers an agent for `cookie`'s user and returns an ingest closure.
		agentFor: async (cookie: string) => {
			const created = (await (
				await apiJson(
					"POST",
					"/api/v1/agents",
					{ type: "claude_code", name: "CC" },
					cookie,
				)
			).json()) as { secret: string };
			return async (sessionId: string, body?: object): Promise<string> => {
				const res = await appFetch("/api/v1/agent-entries", {
					method: "POST",
					headers: {
						authorization: `Bearer ${created.secret}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						workspaceId: base.ws.id,
						sessionId,
						durationMinutes: 10,
						...body,
					}),
				});
				expect(res.status).toBe(200);
				return ((await res.json()) as { id: string }).id;
			};
		},
	};
}

async function linkRowsFor(workEntryId: string): Promise<string[]> {
	const db = createDb(env.DB as D1Database);
	const rows = await db.select().from(schema.workEntryAgentEntries);
	return rows
		.filter((r) => r.workEntryId === workEntryId)
		.map((r) => r.agentEntryId)
		.sort();
}

it("links the created entry to the caller's own agent entries", async () => {
	const { admin, ws, project, agentFor } = await setupWithAgentIngest();
	const ingest = await agentFor(admin);
	const a = await ingest("link-a");
	const b = await ingest("link-b");

	const res = await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws.id,
			projectId: project.id,
			entryDate: "2026-06-01",
			durationMinutes: 20,
			description: "from sessions",
			agentEntryIds: [a, b],
		},
		admin,
	);
	expect(res.status).toBe(201);
	const entry = (await res.json()) as { id: string };
	expect(await linkRowsFor(entry.id)).toEqual([a, b].sort());
});

it("rejects linking unknown, foreign-owner, or cross-workspace agent entries", async () => {
	const { admin, member, ws, project, agentFor } = await setupWithAgentIngest();
	const ingest = await agentFor(admin);
	// The admin's session is logged into the shared project, so the member can
	// *read* it — reading is not enough to link someone else's work.
	const adminEntry = await ingest("owned-by-admin", { projectId: project.id });

	const create = (cookie: string, agentEntryIds: string[]) =>
		apiJson(
			"POST",
			"/api/v1/work-entries",
			{
				workspaceId: ws.id,
				projectId: project.id,
				entryDate: "2026-06-01",
				durationMinutes: 20,
				description: "attempt",
				agentEntryIds,
			},
			cookie,
		);

	expect((await create(admin, ["no-such-id"])).status).toBe(400);
	expect((await create(member, [adminEntry])).status).toBe(400);

	// Same owner, but the work entry is created in a different workspace.
	const ws2 = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "other", name: "Other" },
			admin,
		)
	).json()) as { id: string };
	const project2 = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws2.id}/projects`,
			{ slug: "p2", name: "P2" },
			admin,
		)
	).json()) as { id: string };
	const crossWorkspace = await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws2.id,
			projectId: project2.id,
			entryDate: "2026-06-01",
			durationMinutes: 20,
			description: "attempt",
			agentEntryIds: [adminEntry],
		},
		admin,
	);
	expect(crossWorkspace.status).toBe(400);

	// Nothing was linked by any of the rejected attempts.
	const db = createDb(env.DB as D1Database);
	expect(await db.select().from(schema.workEntryAgentEntries)).toHaveLength(0);
});

it("caps agentEntryIds per entry", async () => {
	const { admin, ws, project } = await setupWithAgentIngest();
	const res = await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws.id,
			projectId: project.id,
			entryDate: "2026-06-01",
			durationMinutes: 20,
			description: "too many",
			agentEntryIds: Array.from({ length: 51 }, (_, i) => `id-${i}`),
		},
		admin,
	);
	expect(res.status).toBe(400);
});

it("cascades link rows when either side is deleted", async () => {
	const { admin, ws, project, agentFor } = await setupWithAgentIngest();
	const ingest = await agentFor(admin);
	const a = await ingest("cascade-a");
	const b = await ingest("cascade-b");
	const create = async () =>
		(await (
			await apiJson(
				"POST",
				"/api/v1/work-entries",
				{
					workspaceId: ws.id,
					projectId: project.id,
					entryDate: "2026-06-01",
					durationMinutes: 20,
					description: "linked",
					agentEntryIds: [a, b],
				},
				admin,
			)
		).json()) as { id: string };

	// Deleting the work entry drops its links; the agent entries survive.
	const first = await create();
	expect(await linkRowsFor(first.id)).toHaveLength(2);
	await apiJson("DELETE", `/api/v1/work-entries/${first.id}`, undefined, admin);
	expect(await linkRowsFor(first.id)).toHaveLength(0);
	const agentList = (await (
		await apiGet(`/api/v1/agent-entries?workspaceId=${ws.id}`, admin)
	).json()) as unknown[];
	expect(agentList).toHaveLength(2);

	// Deleting the agent entries drops the links; the work entry survives.
	const second = await create();
	const deleted = await apiJson(
		"POST",
		"/api/v1/agent-entries/delete",
		{ workspaceId: ws.id, ids: [a, b] },
		admin,
	);
	expect(deleted.status).toBe(200);
	expect(await linkRowsFor(second.id)).toHaveLength(0);
	const entryRes = await apiGet(`/api/v1/work-entries/${second.id}`, admin);
	expect(entryRes.status).toBe(200);
});

it("rejects entry writes in an archived workspace, reads still work", async () => {
	const { admin, ws, project } = await setup();
	const created = (await (
		await apiJson(
			"POST",
			"/api/v1/work-entries",
			{
				workspaceId: ws.id,
				projectId: project.id,
				entryDate: "2026-06-01",
				durationMinutes: 30,
				description: "before archiving",
			},
			admin,
		)
	).json()) as { id: string };

	await apiJson(
		"PATCH",
		`/api/v1/workspaces/${ws.id}`,
		{ archived: true },
		admin,
	);

	expect(
		(
			await apiJson(
				"POST",
				"/api/v1/work-entries",
				{
					workspaceId: ws.id,
					projectId: project.id,
					entryDate: "2026-06-02",
					durationMinutes: 10,
					description: "while archived",
				},
				admin,
			)
		).status,
	).toBe(409);
	expect(
		(
			await apiJson(
				"POST",
				"/api/v1/work-entries/batch",
				{
					workspaceId: ws.id,
					entries: [
						{
							projectId: project.id,
							entryDate: "2026-06-02",
							durationMinutes: 10,
							description: "while archived",
						},
					],
				},
				admin,
			)
		).status,
	).toBe(409);
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/work-entries/${created.id}`,
				{ description: "edited" },
				admin,
			)
		).status,
	).toBe(409);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/work-entries/${created.id}`,
				undefined,
				admin,
			)
		).status,
	).toBe(409);

	// Existing entries stay readable.
	expect(
		(await apiGet(`/api/v1/work-entries/${created.id}`, admin)).status,
	).toBe(200);
	expect(
		(await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}`, admin)).status,
	).toBe(200);
});

// A work entry linked to the given agent entries, created by `cookie`.
async function createLinkedEntry(
	cookie: string,
	wsId: string,
	projectId: string | null,
	agentEntryIds: string[],
): Promise<string> {
	const res = await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: wsId,
			projectId,
			entryDate: "2026-06-01",
			durationMinutes: 20,
			description: "from sessions",
			agentEntryIds,
		},
		cookie,
	);
	expect(res.status).toBe(201);
	return ((await res.json()) as { id: string }).id;
}

it("returns the linked agent sessions, serialized and chronological", async () => {
	const { admin, ws, project, agentFor } = await setupWithAgentIngest();
	const ingest = await agentFor(admin);
	const later = await ingest("later", {
		startedAt: "2026-06-02T10:00:00.000Z",
		usage: { totalTokens: 500, costUsd: 1.5 },
		context: { refs: ["github:acme/repo#7"] },
	});
	const earlier = await ingest("earlier", {
		startedAt: "2026-06-01T10:00:00.000Z",
		usage: { totalTokens: 800 },
		context: { refs: ["github:acme/repo#8"] },
	});
	const entryId = await createLinkedEntry(admin, ws.id, project.id, [
		later,
		earlier,
	]);

	const res = await apiGet(
		`/api/v1/work-entries/${entryId}/agent-entries`,
		admin,
	);
	expect(res.status).toBe(200);
	const rows = (await res.json()) as Array<{
		id: string;
		entryDate: string;
		rollupEventCount?: number;
		usage: { totalTokens: number } | null;
		context: { refs?: string[] } | null;
	}>;
	// Ordered by startedAt ascending.
	expect(rows.map((r) => r.id)).toEqual([earlier, later]);
	// Serialized: entryDate derived, internal rollup counter stripped.
	expect(rows[0]?.entryDate).toBeDefined();
	expect(rows[0]?.rollupEventCount).toBeUndefined();
	expect(rows[1]?.usage?.totalTokens).toBe(500);
	expect(rows[1]?.context?.refs).toEqual(["github:acme/repo#7"]);
});

it("filters linked sessions by the agent-entry ACL", async () => {
	const { admin, member, ws, project, agentFor } = await setupWithAgentIngest();
	const ingest = await agentFor(admin);
	// One session assigned to the shared project (a project member may read it),
	// one unassigned (owner-only agent activity).
	const assigned = await ingest("assigned", { projectId: project.id });
	const unassigned = await ingest("unassigned");
	const entryId = await createLinkedEntry(admin, ws.id, project.id, [
		assigned,
		unassigned,
	]);

	const asAdmin = (await (
		await apiGet(`/api/v1/work-entries/${entryId}/agent-entries`, admin)
	).json()) as Array<{ id: string }>;
	expect(asAdmin.map((r) => r.id).sort()).toEqual(
		[assigned, unassigned].sort(),
	);

	const asMember = await apiGet(
		`/api/v1/work-entries/${entryId}/agent-entries`,
		member,
	);
	expect(asMember.status).toBe(200);
	// The member reads the entry (project member) but sees only the session in
	// their project — the owner-only unassigned one stays hidden.
	expect(
		((await asMember.json()) as Array<{ id: string }>).map((r) => r.id),
	).toEqual([assigned]);
});

it("returns an empty list for an entry with no linked sessions", async () => {
	const { admin, ws, project } = await setupWithAgentIngest();
	const entryId = await createLinkedEntry(admin, ws.id, project.id, []);
	const res = await apiGet(
		`/api/v1/work-entries/${entryId}/agent-entries`,
		admin,
	);
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual([]);
});

it("404s for an unknown or unreadable entry", async () => {
	const { admin, member, ws, agentFor } = await setupWithAgentIngest();
	const ingest = await agentFor(admin);
	const a = await ingest("a", { projectId: undefined });

	expect(
		(await apiGet("/api/v1/work-entries/no-such-id/agent-entries", admin))
			.status,
	).toBe(404);

	// An entry in a project the member does not belong to is invisible to them.
	const privateProject = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "private", name: "Private" },
			admin,
		)
	).json()) as { id: string };
	const entryId = await createLinkedEntry(admin, ws.id, privateProject.id, [a]);
	expect(
		(await apiGet(`/api/v1/work-entries/${entryId}/agent-entries`, member))
			.status,
	).toBe(404);
});

it("403s when the agents feature is disabled", async () => {
	const { admin, ws, project } = await setupWithAgentIngest();
	const entryId = await createLinkedEntry(admin, ws.id, project.id, []);
	await apiJson(
		"PATCH",
		"/api/v1/instance/agents",
		{ agentsEnabled: false },
		admin,
	);
	expect(
		(await apiGet(`/api/v1/work-entries/${entryId}/agent-entries`, admin))
			.status,
	).toBe(403);
});

it("never surfaces a linked session from another workspace", async () => {
	const { admin, ws, project, agentFor } = await setupWithAgentIngest();
	// A second workspace owned by the same admin, with a session logged there.
	const ws2 = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "other", name: "Other" },
			admin,
		)
	).json()) as { id: string };
	const ingest = await agentFor(admin);
	const foreign = await ingest("foreign", { workspaceId: ws2.id });

	// A ws1 entry, with a corrupt cross-workspace link inserted directly (the API
	// rejects such a link at create; this asserts the read-side workspace guard).
	const entryId = await createLinkedEntry(admin, ws.id, project.id, []);
	const db = createDb(env.DB as D1Database);
	await db.insert(schema.workEntryAgentEntries).values({
		workEntryId: entryId,
		agentEntryId: foreign,
		createdAt: new Date(),
	});

	// Even though the admin owns the foreign session (ACL `self` branch), the
	// workspace guard keeps a cross-workspace link from surfacing it here.
	const rows = (await (
		await apiGet(`/api/v1/work-entries/${entryId}/agent-entries`, admin)
	).json()) as unknown[];
	expect(rows).toEqual([]);
});

it("keeps the instance-admin bypass when the admin is also a plain member", async () => {
	// An instance admin holding a plain `member` row in a workspace owned by
	// someone else, belonging to none of its projects: that incidental row must
	// not demote the bypass (docs/permissions.md, Principle 1).
	const owner = await signUpUser("Owner", "owner@example.com");
	const iAdmin = await signUpAdmin("IAdmin", "iadmin@example.com");
	const plainMember = await signUpUser("Plain", "plain@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme" },
			owner,
		)
	).json()) as { id: string };
	for (const email of ["iadmin@example.com", "plain@example.com"]) {
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/members`,
			{ email },
			owner,
		);
	}
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "spantail", name: "Spantail" },
			owner,
		)
	).json()) as { id: string };
	const entry = (await (
		await apiJson(
			"POST",
			"/api/v1/work-entries",
			{
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 30,
				description: "Owner work",
			},
			owner,
		)
	).json()) as { id: string };

	// The instance admin reads the project-assigned entry (matrix `R`).
	expect(
		(await apiGet(`/api/v1/work-entries/${entry.id}`, iAdmin)).status,
	).toBe(200);
	const adminList = (await (
		await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}`, iAdmin)
	).json()) as Array<{ id: string }>;
	expect(adminList.map((e) => e.id)).toEqual([entry.id]);

	// A workspace member who is not an instance admin still cannot: the entry's
	// existence is not revealed.
	expect(
		(await apiGet(`/api/v1/work-entries/${entry.id}`, plainMember)).status,
	).toBe(404);
	expect(
		await (
			await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}`, plainMember)
		).json(),
	).toEqual([]);
});
