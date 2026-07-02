import { expect, it } from "vitest";

import {
	apiGet,
	apiJson,
	defaultTemplateId,
	signUpUser,
} from "../../../test/helpers";

interface ReportSend {
	id: string;
	createdAt: string;
	message: string | null;
	recipientNames: string[];
	recipientCount: number;
	readCount: number;
}

/**
 * Owner (bootstrap instance admin) + two eligible recipients + a workspace admin
 * (admin-read of a single-workspace report) + one report in their shared workspace.
 */
async function setup() {
	const owner = await signUpUser("Owner", "owner@example.com");
	const alice = await signUpUser("Alice", "alice@example.com");
	const bob = await signUpUser("Bob", "bob@example.com");
	const wsAdmin = await signUpUser("WsAdmin", "wsadmin@example.com");
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
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "wsadmin@example.com", role: "admin" },
		owner,
	);
	const idOf = async (cookie: string) =>
		(
			(await (await apiGet("/api/v1/me", cookie)).json()) as {
				user: { id: string };
			}
		).user.id;
	const aliceId = await idOf(alice);
	const bobId = await idOf(bob);
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
	return { owner, alice, bob, wsAdmin, report, aliceId, bobId };
}

const sends = async (cookie: string, reportId: string) =>
	(await (
		await apiGet(`/api/v1/reports/${reportId}/sends`, cookie)
	).json()) as ReportSend[];

it("lists one history entry per send batch, with read counts", async () => {
	const { owner, alice, report, aliceId, bobId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [aliceId, bobId], message: "Please review" },
		owner,
	);

	const before = await sends(owner, report.id);
	expect(before).toHaveLength(1);
	expect(before[0]?.recipientCount).toBe(2);
	expect([...(before[0]?.recipientNames ?? [])].sort()).toEqual([
		"Alice",
		"Bob",
	]);
	expect(before[0]?.message).toBe("Please review");
	expect(before[0]?.readCount).toBe(0);

	// Alice opens her copy → the batch's read count rises to 1.
	const aliceInbox = (await (
		await apiGet("/api/v1/inbox?folder=inbox", alice)
	).json()) as { id: string }[];
	await apiJson("POST", `/api/v1/inbox/${aliceInbox[0]?.id}/read`, {}, alice);

	const after = await sends(owner, report.id);
	expect(after[0]?.readCount).toBe(1);
});

it("excludes a self-copy from the recipient list and count", async () => {
	const { owner, report, aliceId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [aliceId], sendToSelf: true },
		owner,
	);
	const rows = await sends(owner, report.id);
	expect(rows).toHaveLength(1);
	expect(rows[0]?.recipientCount).toBe(1);
	expect(rows[0]?.recipientNames).toEqual(["Alice"]);
});

it("keeps a self-only send as an entry with zero recipients", async () => {
	const { owner, report } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ sendToSelf: true },
		owner,
	);
	const rows = await sends(owner, report.id);
	expect(rows).toHaveLength(1);
	expect(rows[0]?.recipientCount).toBe(0);
	expect(rows[0]?.recipientNames).toEqual([]);
	expect(rows[0]?.readCount).toBe(0);
});

it("does not reveal another user's report send history", async () => {
	const { alice, report } = await setup();
	const res = await apiGet(`/api/v1/reports/${report.id}/sends`, alice);
	expect(res.status).toBe(404);
});

it("lets a workspace admin read the owner's send history (admin R*)", async () => {
	const { owner, wsAdmin, report, aliceId } = await setup();
	await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [aliceId] },
		owner,
	);
	// wsAdmin never sent this report, but reads it (R*); the history is scoped to
	// the report's owner as sender, so it still lists the owner's send.
	const rows = await sends(wsAdmin, report.id);
	expect(rows).toHaveLength(1);
	expect(rows[0]?.recipientCount).toBe(1);
	expect(rows[0]?.recipientNames).toEqual(["Alice"]);
});
