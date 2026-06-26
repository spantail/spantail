import { expect, it } from "vitest";

import {
	apiGet,
	apiJson,
	defaultTemplateId,
	signUpUser,
} from "../../../test/helpers";

/**
 * Sets up an owner + a workspace member (eligible recipient) + an outsider
 * (no shared workspace), plus one report owned by the owner.
 */
async function setup() {
	const owner = await signUpUser("Owner", "owner@example.com");
	const member = await signUpUser("Member", "member@example.com");
	const outsider = await signUpUser("Outsider", "outsider@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			owner,
		)
	).json()) as { id: string };
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		owner,
	);
	const memberId = (
		(await (await apiGet("/api/v1/me", member)).json()) as {
			user: { id: string };
		}
	).user.id;
	// The member joins the project so they can receive a report that includes it.
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "spantail", name: "Spantail", memberUserIds: [memberId] },
			owner,
		)
	).json()) as { id: string };
	await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws.id,
			projectId: project.id,
			durationMinutes: 30,
			description: "Built the inbox",
		},
		owner,
	);
	const report = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{
				name: "Daily",
				templateId: await defaultTemplateId(owner),
				filters: { workspaceIds: [ws.id], dateRange: "today" },
			},
			owner,
		)
	).json()) as { id: string; renderedMarkdown: string };
	return { owner, member, outsider, ws, report, memberId };
}

it("lists recipients as workspace members minus the sender", async () => {
	const { owner, member, report } = await setup();
	const list = (await (
		await apiGet(`/api/v1/reports/${report.id}/recipients`, owner)
	).json()) as Array<{ id: string; email: string }>;
	expect(list.map((r) => r.email)).toContain("member@example.com");
	expect(list.map((r) => r.email)).not.toContain("owner@example.com");
	// A non-owner cannot enumerate recipients.
	expect(
		(await apiGet(`/api/v1/reports/${report.id}/recipients`, member)).status,
	).toBe(404);
});

it("delivers a frozen snapshot to a recipient's inbox", async () => {
	const { owner, member, report, memberId } = await setup();

	const sent = await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [memberId], message: "Please review" },
		owner,
	);
	expect(sent.status).toBe(201);
	expect((await sent.json()) as { delivered: number }).toEqual({
		delivered: 1,
	});

	// Recipient sees it, unread.
	const inbox = (await (await apiGet("/api/v1/inbox", member)).json()) as Array<
		Record<string, unknown>
	>;
	expect(inbox).toHaveLength(1);
	const item = inbox[0];
	expect(item?.reportName).toBe("Daily");
	expect(item?.senderName).toBe("Owner");
	expect(item?.message).toBe("Please review");
	expect(item?.readAt).toBeNull();
	// List payloads omit the body and internal ids.
	expect(item).not.toHaveProperty("renderedMarkdown");
	expect(item).not.toHaveProperty("recipientUserId");

	const count = (await (
		await apiGet("/api/v1/inbox/unread-count", member)
	).json()) as { count: number };
	expect(count.count).toBe(1);

	// The frozen body matches the report at send time.
	const detail = (await (
		await apiGet(`/api/v1/inbox/${item?.id}`, member)
	).json()) as { renderedMarkdown: string };
	expect(detail.renderedMarkdown).toBe(report.renderedMarkdown);

	// The owner's own inbox stays empty.
	expect(
		((await (await apiGet("/api/v1/inbox", owner)).json()) as unknown[]).length,
	).toBe(0);
});

it("marks messages read individually and in bulk", async () => {
	const { owner, member, report, memberId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [memberId] },
		owner,
	);
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [memberId] },
		owner,
	);

	const inbox = (await (
		await apiGet("/api/v1/inbox", member)
	).json()) as Array<{ id: string }>;
	expect(inbox).toHaveLength(2);

	// Read one.
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/inbox/${inbox[0]?.id}/read`,
				undefined,
				member,
			)
		).status,
	).toBe(204);
	expect(
		(
			(await (await apiGet("/api/v1/inbox/unread-count", member)).json()) as {
				count: number;
			}
		).count,
	).toBe(1);

	// Read all.
	expect(
		(await apiJson("POST", "/api/v1/inbox/read-all", undefined, member)).status,
	).toBe(204);
	expect(
		(
			(await (await apiGet("/api/v1/inbox/unread-count", member)).json()) as {
				count: number;
			}
		).count,
	).toBe(0);
});

it("returns a read message to the unread state", async () => {
	const { owner, member, report, memberId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [memberId] },
		owner,
	);
	const inbox = (await (
		await apiGet("/api/v1/inbox", member)
	).json()) as Array<{ id: string }>;
	const id = inbox[0]?.id;

	await apiJson("POST", `/api/v1/inbox/${id}/read`, undefined, member);
	const unread = async () =>
		(
			(await (await apiGet("/api/v1/inbox/unread-count", member)).json()) as {
				count: number;
			}
		).count;
	expect(await unread()).toBe(0);

	expect(
		(await apiJson("POST", `/api/v1/inbox/${id}/unread`, undefined, member))
			.status,
	).toBe(204);
	expect(await unread()).toBe(1);
});

it("cascades report deletion to the deliveries it produced", async () => {
	const { owner, member, report, memberId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [memberId] },
		owner,
	);
	expect(
		((await (await apiGet("/api/v1/inbox", member)).json()) as unknown[])
			.length,
	).toBe(1);

	expect(
		(await apiJson("DELETE", `/api/v1/reports/${report.id}`, undefined, owner))
			.status,
	).toBe(204);
	expect(
		((await (await apiGet("/api/v1/inbox", member)).json()) as unknown[])
			.length,
	).toBe(0);
});

it("rejects recipients outside the report's workspaces", async () => {
	const { owner, outsider, report } = await setup();
	const outsiderId = (
		(await (await apiGet("/api/v1/me", outsider)).json()) as {
			user: { id: string };
		}
	).user.id;

	const res = await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [outsiderId] },
		owner,
	);
	expect(res.status).toBe(400);
});

it("validates send input and hides the report from non-owners", async () => {
	const { owner, member, report, memberId } = await setup();
	// Empty recipient list is rejected.
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/reports/${report.id}/send`,
				{ recipientUserIds: [] },
				owner,
			)
		).status,
	).toBe(400);
	// A non-owner can't send the report (existence not revealed).
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/reports/${report.id}/send`,
				{ recipientUserIds: [memberId] },
				member,
			)
		).status,
	).toBe(404);
});

it("restricts recipients to members of every workspace in the report", async () => {
	const owner = await signUpUser("Owner", "owner@example.com");
	const both = await signUpUser("Both", "both@example.com");
	const onlyA = await signUpUser("OnlyA", "onlya@example.com");
	const mkWs = async (slug: string) =>
		(await (
			await apiJson(
				"POST",
				"/api/v1/workspaces",
				{ slug, name: slug, timezone: "Asia/Tokyo" },
				owner,
			)
		).json()) as { id: string };
	const wsA = await mkWs("alpha");
	const wsB = await mkWs("beta");
	for (const ws of [wsA, wsB]) {
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/members`,
			{ email: "both@example.com" },
			owner,
		);
	}
	// onlyA belongs to A but not B.
	await apiJson(
		"POST",
		`/api/v1/workspaces/${wsA.id}/members`,
		{ email: "onlya@example.com" },
		owner,
	);

	const report = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{
				name: "Cross",
				templateId: await defaultTemplateId(owner),
				filters: { workspaceIds: [wsA.id, wsB.id], dateRange: "this_month" },
			},
			owner,
		)
	).json()) as { id: string };

	const emails = (
		(await (
			await apiGet(`/api/v1/reports/${report.id}/recipients`, owner)
		).json()) as Array<{ id: string; email: string }>
	).map((r) => r.email);
	expect(emails).toContain("both@example.com");
	expect(emails).not.toContain("onlya@example.com");

	const onlyAId = (
		(await (await apiGet("/api/v1/me", onlyA)).json()) as {
			user: { id: string };
		}
	).user.id;
	// A member of only one of the report's workspaces can't be a recipient.
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/reports/${report.id}/send`,
				{ recipientUserIds: [onlyAId] },
				owner,
			)
		).status,
	).toBe(400);
	void both;
});

it("scopes inbox reads to the recipient", async () => {
	const { owner, member, outsider, report, memberId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [memberId] },
		owner,
	);
	const id = (
		(await (await apiGet("/api/v1/inbox", member)).json()) as Array<{
			id: string;
		}>
	)[0]?.id;

	// Another user cannot read or mutate someone else's message.
	expect((await apiGet(`/api/v1/inbox/${id}`, outsider)).status).toBe(404);
	expect(
		(await apiJson("POST", `/api/v1/inbox/${id}/read`, undefined, outsider))
			.status,
	).toBe(404);
	expect(
		(await apiJson("DELETE", `/api/v1/inbox/${id}`, undefined, outsider))
			.status,
	).toBe(404);
});

it("paginates a mailbox folder", async () => {
	const { owner, member, report, memberId } = await setup();
	// Three separate sends → three distinct received items for the member.
	for (let i = 0; i < 3; i++) {
		expect(
			(
				await apiJson(
					"POST",
					`/api/v1/reports/${report.id}/send`,
					{ recipientUserIds: [memberId] },
					owner,
				)
			).status,
		).toBe(201);
	}
	const ids = async (qs: string) =>
		(
			(await (await apiGet(`/api/v1/inbox${qs}`, member)).json()) as Array<{
				id: string;
			}>
		).map((m) => m.id);

	const all = await ids("?folder=inbox");
	expect(all).toHaveLength(3);
	const page1 = await ids("?folder=inbox&limit=2");
	const page2 = await ids("?folder=inbox&limit=2&offset=2");
	expect(page1).toHaveLength(2);
	expect(page2).toHaveLength(1);
	// Stable, disjoint, and covering the whole folder.
	expect(new Set([...page1, ...page2])).toEqual(new Set(all));
});
