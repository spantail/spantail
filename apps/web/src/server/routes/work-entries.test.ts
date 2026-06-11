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
