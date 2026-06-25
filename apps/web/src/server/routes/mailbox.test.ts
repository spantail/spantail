import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

interface MailItem {
	id: string;
	scope: "received" | "sent";
	batchId: string;
	reportName: string;
	readAt: string | null;
	starred: boolean;
	archived: boolean;
	trashed: boolean;
	recipientCount: number;
	recipientNames: string[];
}

/** Owner + two workspace members (eligible recipients) + one report. */
async function setup() {
	const owner = await signUpUser("Owner", "owner@example.com");
	const alice = await signUpUser("Alice", "alice@example.com");
	const bob = await signUpUser("Bob", "bob@example.com");
	const outsider = await signUpUser("Outsider", "outsider@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
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
	const idOf = async (cookie: string) =>
		(
			(await (await apiGet("/api/v1/me", cookie)).json()) as {
				user: { id: string };
			}
		).user.id;
	const aliceId = await idOf(alice);
	const bobId = await idOf(bob);
	// Both recipients join the project so they can receive a report including it.
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "spantail", name: "Spantail", memberUserIds: [aliceId, bobId] },
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
			description: "Built the mailbox",
		},
		owner,
	);
	const report = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{
				name: "Daily",
				templateId: "builtin:daily",
				filters: { workspaceIds: [ws.id], dateRange: "today" },
			},
			owner,
		)
	).json()) as { id: string };
	return {
		owner,
		alice,
		bob,
		outsider,
		report,
		aliceId,
		bobId,
	};
}

const folder = async (cookie: string, name: string) =>
	(await (
		await apiGet(`/api/v1/inbox?folder=${name}`, cookie)
	).json()) as MailItem[];

it("groups a fan-out send into one Sent entry, one inbox row each", async () => {
	const { owner, alice, bob, report, aliceId, bobId } = await setup();
	const sent = await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [aliceId, bobId] },
		owner,
	);
	expect((await sent.json()) as { delivered: number }).toEqual({
		delivered: 2,
	});

	// Sender's Sent: a single batch entry covering both recipients.
	const ownerSent = await folder(owner, "sent");
	expect(ownerSent).toHaveLength(1);
	expect(ownerSent[0]?.scope).toBe("sent");
	expect(ownerSent[0]?.recipientCount).toBe(2);
	expect([...(ownerSent[0]?.recipientNames ?? [])].sort()).toEqual([
		"Alice",
		"Bob",
	]);

	// Each recipient gets one received row; the sender's inbox stays empty.
	expect(await folder(alice, "inbox")).toHaveLength(1);
	expect(await folder(bob, "inbox")).toHaveLength(1);
	expect(await folder(owner, "inbox")).toHaveLength(0);
});

it("keeps recipient and sender flags independent (no collision)", async () => {
	const { owner, alice, report, aliceId, bobId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [aliceId, bobId] },
		owner,
	);

	const aliceItem = (await folder(alice, "inbox"))[0];
	const ownerBatch = (await folder(owner, "sent"))[0];
	if (!aliceItem || !ownerBatch) throw new Error("setup failed");

	// Alice stars her received copy.
	expect(
		(
			await apiJson(
				"PATCH",
				"/api/v1/inbox/flags",
				{ scope: "received", targetId: aliceItem.id, starred: true },
				alice,
			)
		).status,
	).toBe(204);
	// Owner stars the sent batch.
	expect(
		(
			await apiJson(
				"PATCH",
				"/api/v1/inbox/flags",
				{ scope: "sent", targetId: ownerBatch.batchId, starred: true },
				owner,
			)
		).status,
	).toBe(204);

	// Each sees exactly their own starred item — the flags never cross.
	const aliceStarred = await folder(alice, "starred");
	expect(aliceStarred).toHaveLength(1);
	expect(aliceStarred[0]?.scope).toBe("received");
	const ownerStarred = await folder(owner, "starred");
	expect(ownerStarred).toHaveLength(1);
	expect(ownerStarred[0]?.scope).toBe("sent");
	// Bob (also a recipient) starred nothing.
});

it("moves items between folders on archive, trash, and restore", async () => {
	const { owner, alice, report, aliceId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [aliceId] },
		owner,
	);
	const item = (await folder(alice, "inbox"))[0];
	if (!item) throw new Error("setup failed");
	const flag = (body: unknown) =>
		apiJson("PATCH", "/api/v1/inbox/flags", body, alice);
	const unread = async () =>
		(
			(await (await apiGet("/api/v1/inbox/unread-count", alice)).json()) as {
				count: number;
			}
		).count;

	// Archive: leaves Inbox, enters Archive, drops from the unread badge.
	await flag({ scope: "received", targetId: item.id, archived: true });
	expect(await folder(alice, "inbox")).toHaveLength(0);
	expect(await folder(alice, "archive")).toHaveLength(1);
	expect(await unread()).toBe(0);

	// Trash is terminal: it hides the item from Archive and Starred.
	await flag({ scope: "received", targetId: item.id, trashed: true });
	expect(await folder(alice, "archive")).toHaveLength(0);
	expect(await folder(alice, "trash")).toHaveLength(1);
	await flag({ scope: "received", targetId: item.id, starred: true });
	expect(await folder(alice, "starred")).toHaveLength(0);

	// Restore from trash: the (still archived, now starred) item reappears.
	await flag({ scope: "received", targetId: item.id, trashed: false });
	expect(await folder(alice, "trash")).toHaveLength(0);
	expect(await folder(alice, "archive")).toHaveLength(1);
	expect(await folder(alice, "starred")).toHaveLength(1);
});

it("reports folder counts for the sidebar", async () => {
	const { owner, alice, report, aliceId, bobId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [aliceId, bobId] },
		owner,
	);
	const counts = (await (
		await apiGet("/api/v1/inbox/counts", owner)
	).json()) as Record<string, number>;
	expect(counts.sent).toBe(1);
	expect(counts.inbox).toBe(0);
	const aliceCounts = (await (
		await apiGet("/api/v1/inbox/counts", alice)
	).json()) as Record<string, number>;
	expect(aliceCounts.inbox).toBe(1);
	expect(aliceCounts.unread).toBe(1);
});

it("mark-all-read leaves archived/trashed unread mail untouched", async () => {
	const { owner, alice, report, aliceId } = await setup();
	// Two separate sends → two received messages, both unread.
	for (let n = 0; n < 2; n++) {
		await apiJson(
			"POST",
			`/api/v1/reports/${report.id}/send`,
			{ recipientUserIds: [aliceId] },
			owner,
		);
	}
	const items = await folder(alice, "inbox");
	expect(items).toHaveLength(2);
	const hidden = items[0];
	if (!hidden) throw new Error("setup failed");

	// Archive one while it is still unread, then mark all read.
	await apiJson(
		"PATCH",
		"/api/v1/inbox/flags",
		{ scope: "received", targetId: hidden.id, archived: true },
		alice,
	);
	await apiJson("POST", "/api/v1/inbox/read-all", undefined, alice);

	// The archived message stays unread (only visible Inbox mail was cleared).
	const archived = await folder(alice, "archive");
	expect(archived).toHaveLength(1);
	expect(archived[0]?.readAt).toBeNull();
	const unreadCount = (await (
		await apiGet("/api/v1/inbox/unread-count", alice)
	).json()) as { count: number };
	expect(unreadCount.count).toBe(0);
});

it("rejects flagging a target the caller doesn't own", async () => {
	const { owner, alice, outsider, report, aliceId, bobId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [aliceId, bobId] },
		owner,
	);
	const aliceItem = (await folder(alice, "inbox"))[0];
	const ownerBatch = (await folder(owner, "sent"))[0];
	if (!aliceItem || !ownerBatch) throw new Error("setup failed");

	// An outsider can't flag Alice's received message.
	expect(
		(
			await apiJson(
				"PATCH",
				"/api/v1/inbox/flags",
				{ scope: "received", targetId: aliceItem.id, starred: true },
				outsider,
			)
		).status,
	).toBe(404);
	// A recipient can't flag the sender's batch (they aren't the sender).
	expect(
		(
			await apiJson(
				"PATCH",
				"/api/v1/inbox/flags",
				{ scope: "sent", targetId: ownerBatch.batchId, starred: true },
				alice,
			)
		).status,
	).toBe(404);
	// No flag provided is a bad request.
	expect(
		(
			await apiJson(
				"PATCH",
				"/api/v1/inbox/flags",
				{ scope: "received", targetId: aliceItem.id },
				alice,
			)
		).status,
	).toBe(400);
});
