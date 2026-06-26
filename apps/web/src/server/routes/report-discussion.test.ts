import { expect, it } from "vitest";

import {
	apiGet,
	apiJson,
	defaultTemplateId,
	signUpUser,
} from "../../../test/helpers";

interface Discussion {
	shared: boolean;
	reactions: Array<{
		emoji: string;
		count: number;
		reactedByMe: boolean;
		userNames: string[];
	}>;
	comments: Array<{
		id: string;
		authorName: string;
		body: string;
		editable: boolean;
		createdAt: string;
		updatedAt: string;
		reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
	}>;
}

/**
 * Owner + a workspace member (eligible recipient) + an outsider (no shared
 * workspace), plus one report owned by the owner.
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
	).json()) as { id: string };
	const memberId = (
		(await (await apiGet("/api/v1/me", member)).json()) as {
			user: { id: string };
		}
	).user.id;
	return { owner, member, outsider, ws, report, memberId };
}

async function send(report: { id: string }, owner: string, memberId: string) {
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [memberId] },
		owner,
	);
}

const getDiscussion = async (reportId: string, user: string) =>
	(await (
		await apiGet(`/api/v1/reports/${reportId}/discussion`, user)
	).json()) as Discussion;

it("hides the discussion from non-participants but not the owner of an unsent report", async () => {
	const { owner, member, outsider, report } = await setup();
	// Owner is a participant even before sending; the thread is just not enabled.
	const unsent = await getDiscussion(report.id, owner);
	expect(unsent.shared).toBe(false);
	expect(unsent.comments).toHaveLength(0);

	// A user with no delivery and no ownership gets a 404 (existence hidden).
	expect(
		(await apiGet(`/api/v1/reports/${report.id}/discussion`, outsider)).status,
	).toBe(404);
	// The member has not received it yet either.
	expect(
		(await apiGet(`/api/v1/reports/${report.id}/discussion`, member)).status,
	).toBe(404);
});

it("blocks mutations until the report has been shared", async () => {
	const { owner, report } = await setup();
	// Owner of an unsent report cannot react or comment.
	expect(
		(
			await apiJson(
				"PUT",
				`/api/v1/reports/${report.id}/reactions`,
				{ emoji: "+1" },
				owner,
			)
		).status,
	).toBe(400);
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/reports/${report.id}/comments`,
				{ body: "hi" },
				owner,
			)
		).status,
	).toBe(400);
});

it("lets the sender and recipient share one comment thread", async () => {
	const { owner, member, report, memberId } = await setup();
	await send(report, owner, memberId);

	// Recipient comments.
	const created = (await (
		await apiJson(
			"POST",
			`/api/v1/reports/${report.id}/comments`,
			{ body: "Looks good **to me**" },
			member,
		)
	).json()) as { id: string; editable: boolean; authorName: string };
	expect(created.authorName).toBe("Member");
	expect(created.editable).toBe(true);

	// Owner sees the recipient's comment but can't edit it.
	const ownerView = await getDiscussion(report.id, owner);
	expect(ownerView.shared).toBe(true);
	expect(ownerView.comments).toHaveLength(1);
	expect(ownerView.comments[0]?.editable).toBe(false);
	expect(ownerView.comments[0]?.body).toBe("Looks good **to me**");
});

it("toggles report-body and comment reactions idempotently", async () => {
	const { owner, member, report, memberId } = await setup();
	await send(report, owner, memberId);

	// Add a body reaction.
	const added = (await (
		await apiJson(
			"PUT",
			`/api/v1/reports/${report.id}/reactions`,
			{ emoji: "+1" },
			owner,
		)
	).json()) as Array<{ emoji: string; count: number; reactedByMe: boolean }>;
	expect(added).toEqual([
		{ emoji: "+1", count: 1, reactedByMe: true, userNames: ["Owner"] },
	]);

	// Same emoji again removes it.
	const removed = (await (
		await apiJson(
			"PUT",
			`/api/v1/reports/${report.id}/reactions`,
			{ emoji: "+1" },
			owner,
		)
	).json()) as unknown[];
	expect(removed).toHaveLength(0);

	// Comment-level reaction targets the comment, not the body.
	const comment = (await (
		await apiJson(
			"POST",
			`/api/v1/reports/${report.id}/comments`,
			{ body: "nice" },
			member,
		)
	).json()) as { id: string };
	await apiJson(
		"PUT",
		`/api/v1/reports/${report.id}/comments/${comment.id}/reactions`,
		{ emoji: "heart" },
		owner,
	);
	const view = await getDiscussion(report.id, member);
	expect(view.reactions).toHaveLength(0);
	expect(view.comments[0]?.reactions).toEqual([
		{ emoji: "heart", count: 1, reactedByMe: false, userNames: ["Owner"] },
	]);
});

it("scopes comment edit and delete to the author", async () => {
	const { owner, member, report, memberId } = await setup();
	await send(report, owner, memberId);
	const comment = (await (
		await apiJson(
			"POST",
			`/api/v1/reports/${report.id}/comments`,
			{ body: "draft" },
			member,
		)
	).json()) as { id: string };

	// The owner cannot edit or delete the member's comment.
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/reports/${report.id}/comments/${comment.id}`,
				{ body: "hijacked" },
				owner,
			)
		).status,
	).toBe(404);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/reports/${report.id}/comments/${comment.id}`,
				undefined,
				owner,
			)
		).status,
	).toBe(404);

	// The author can.
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/reports/${report.id}/comments/${comment.id}`,
				{ body: "final" },
				member,
			)
		).status,
	).toBe(200);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/reports/${report.id}/comments/${comment.id}`,
				undefined,
				member,
			)
		).status,
	).toBe(204);
	expect((await getDiscussion(report.id, member)).comments).toHaveLength(0);
});

it("rejects a comment-level reaction on a comment not in the report", async () => {
	const { owner, member, report, memberId } = await setup();
	await send(report, owner, memberId);
	void member;
	// A comment id that doesn't belong to this report is a 404, never a stray
	// reaction row.
	expect(
		(
			await apiJson(
				"PUT",
				`/api/v1/reports/${report.id}/comments/nonexistent/reactions`,
				{ emoji: "eyes" },
				owner,
			)
		).status,
	).toBe(404);
});

it("keeps the thread shared after the last recipient is deleted", async () => {
	const { owner, member, report, memberId } = await setup();
	await send(report, owner, memberId);
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/comments`,
		{ body: "Reviewed, looks good" },
		member,
	);

	// Delete the member's account (owner is the bootstrap instance admin). Their
	// delivery cascades away, but the comment is retained with a null author.
	expect(
		(await apiJson("DELETE", `/api/v1/users/${memberId}`, undefined, owner))
			.status,
	).toBe(204);

	// The owner still sees the retained thread and can follow up.
	const view = await getDiscussion(report.id, owner);
	expect(view.shared).toBe(true);
	expect(view.comments).toHaveLength(1);
	expect(view.comments[0]?.authorName).toBe("Member");
	expect(view.comments[0]?.editable).toBe(false);
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/reports/${report.id}/comments`,
				{ body: "Thanks for the review" },
				owner,
			)
		).status,
	).toBe(201);
});

it("cascades report deletion to its comments and reactions", async () => {
	const { owner, member, report, memberId } = await setup();
	await send(report, owner, memberId);
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/comments`,
		{ body: "to be removed" },
		member,
	);
	await apiJson(
		"PUT",
		`/api/v1/reports/${report.id}/reactions`,
		{ emoji: "rocket" },
		owner,
	);
	expect((await getDiscussion(report.id, owner)).comments).toHaveLength(1);

	expect(
		(await apiJson("DELETE", `/api/v1/reports/${report.id}`, undefined, owner))
			.status,
	).toBe(204);
	// The report (and its discussion) is gone for everyone.
	expect(
		(await apiGet(`/api/v1/reports/${report.id}/discussion`, owner)).status,
	).toBe(404);
});
