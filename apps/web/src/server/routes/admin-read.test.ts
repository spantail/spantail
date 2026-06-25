import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

// Admin read paths for user-/report-/agent-scoped resources (docs/permissions.md
// Access matrix): an instance admin reads any user's data (R) via ?ownerUserId; a
// workspace admin reads its workspace's data (R*) via ?workspaceId, limited to
// single-workspace reports. Non-admins are never widened; secrets never leak.

async function userId(cookie: string): Promise<string> {
	const me = (await (await apiGet("/api/v1/me", cookie)).json()) as {
		user: { id: string };
	};
	return me.user.id;
}

async function setup() {
	// First signup is the bootstrap instance admin; only an instance admin may
	// create workspaces, so iAdmin owns both and then grants the workspace roles.
	const iAdmin = await signUpUser("IAdmin", "iadmin@example.com");
	// wsAdmin is a workspace admin of ws1 who is NOT an instance admin.
	const wsAdmin = await signUpUser("WsAdmin", "wsadmin@example.com");
	const member = await signUpUser("Member", "member@example.com");
	const recipient = await signUpUser("Recipient", "recipient@example.com");
	const outsider = await signUpUser("Outsider", "outsider@example.com");

	const ws1 = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			iAdmin,
		)
	).json()) as { id: string };
	const ws2 = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "globex", name: "Globex", timezone: "Asia/Tokyo" },
			iAdmin,
		)
	).json()) as { id: string };
	// wsAdmin administers ws1; member and recipient are plain members of ws1.
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws1.id}/members`,
		{ email: "wsadmin@example.com", role: "admin" },
		iAdmin,
	);
	for (const email of ["member@example.com", "recipient@example.com"]) {
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws1.id}/members`,
			{ email },
			iAdmin,
		);
	}
	// member also belongs to ws2, so they can scope a multi-workspace report.
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws2.id}/members`,
		{ email: "member@example.com" },
		iAdmin,
	);

	// member's reports: one scoped to the single workspace ws1, one to ws1+ws2.
	const single = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{
				name: "Single",
				templateId: "builtin:daily",
				filters: { workspaceIds: [ws1.id], dateRange: "today" },
			},
			member,
		)
	).json()) as { id: string };
	const multi = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{
				name: "Multi",
				templateId: "builtin:daily",
				filters: { workspaceIds: [ws1.id, ws2.id], dateRange: "today" },
			},
			member,
		)
	).json()) as { id: string };

	return {
		iAdmin,
		wsAdmin,
		member,
		recipient,
		outsider,
		ws1,
		ws2,
		single,
		multi,
	};
}

it("grants instance admin (R) and workspace admin (R*) report reads", async () => {
	const { iAdmin, wsAdmin, member, outsider, single, multi } = await setup();

	// Item read: instance admin reads either report.
	expect((await apiGet(`/api/v1/reports/${single.id}`, iAdmin)).status).toBe(
		200,
	);
	expect((await apiGet(`/api/v1/reports/${multi.id}`, iAdmin)).status).toBe(
		200,
	);
	// Workspace admin reads the single-workspace report (R*) but not the
	// multi-workspace one (not a per-workspace partial view).
	expect((await apiGet(`/api/v1/reports/${single.id}`, wsAdmin)).status).toBe(
		200,
	);
	expect((await apiGet(`/api/v1/reports/${multi.id}`, wsAdmin)).status).toBe(
		404,
	);
	// The owner is unchanged; an unrelated user gets 404 (existence hidden).
	expect((await apiGet(`/api/v1/reports/${single.id}`, member)).status).toBe(
		200,
	);
	expect((await apiGet(`/api/v1/reports/${single.id}`, outsider)).status).toBe(
		404,
	);
});

it("scopes report listing by ?ownerUserId and ?workspaceId", async () => {
	const { iAdmin, wsAdmin, member, outsider, ws1, single, multi } =
		await setup();
	const memberId = await userId(member);

	// Instance admin lists a user's full set (both reports).
	const adminList = (await (
		await apiGet(`/api/v1/reports?ownerUserId=${memberId}`, iAdmin)
	).json()) as Array<{ id: string }>;
	expect(adminList.map((r) => r.id).sort()).toEqual(
		[single.id, multi.id].sort(),
	);
	// A non-instance-admin cannot use ?ownerUserId.
	expect(
		(await apiGet(`/api/v1/reports?ownerUserId=${memberId}`, wsAdmin)).status,
	).toBe(403);

	// Workspace admin lists only single-workspace reports scoped to ws1 (R*).
	const wsList = (await (
		await apiGet(`/api/v1/reports?workspaceId=${ws1.id}`, wsAdmin)
	).json()) as Array<{ id: string }>;
	expect(wsList.map((r) => r.id)).toEqual([single.id]);
	// A non-member non-admin gets 404 from the workspace gate.
	expect(
		(await apiGet(`/api/v1/reports?workspaceId=${ws1.id}`, outsider)).status,
	).toBe(404);
});

it("lets admins read a report's shares and discussion", async () => {
	const { iAdmin, wsAdmin, member, outsider, single } = await setup();
	const created = await apiJson(
		"POST",
		`/api/v1/reports/${single.id}/shares`,
		{},
		member,
	);
	expect(created.status).toBe(201);

	// Shares: admins read; the passcode hash never leaves the server.
	for (const cookie of [iAdmin, wsAdmin]) {
		const res = await apiGet(`/api/v1/reports/${single.id}/shares`, cookie);
		expect(res.status).toBe(200);
		const shares = (await res.json()) as Array<Record<string, unknown>>;
		expect(shares).toHaveLength(1);
		expect(shares[0]).not.toHaveProperty("passcodeHash");
	}
	expect(
		(await apiGet(`/api/v1/reports/${single.id}/shares`, outsider)).status,
	).toBe(404);

	// Discussion: admins read the thread without being a participant.
	expect(
		(await apiGet(`/api/v1/reports/${single.id}/discussion`, iAdmin)).status,
	).toBe(200);
	expect(
		(await apiGet(`/api/v1/reports/${single.id}/discussion`, wsAdmin)).status,
	).toBe(200);
	expect(
		(await apiGet(`/api/v1/reports/${single.id}/discussion`, outsider)).status,
	).toBe(404);
});

it("lets admins read inbox deliveries by user and by workspace", async () => {
	const { iAdmin, wsAdmin, member, recipient, outsider, ws1, single } =
		await setup();
	const recipientId = await userId(recipient);
	const sent = await apiJson(
		"POST",
		`/api/v1/reports/${single.id}/send`,
		{ recipientUserIds: [recipientId] },
		member,
	);
	expect(sent.status).toBe(201);

	// Instance admin reads the recipient's mailbox (R).
	const byUser = (await (
		await apiGet(`/api/v1/inbox?ownerUserId=${recipientId}`, iAdmin)
	).json()) as Array<{ id: string }>;
	expect(byUser).toHaveLength(1);
	const deliveryId = byUser[0]?.id ?? "";

	// Workspace admin reads the workspace's deliveries (R*, single-ws report).
	const byWs = (await (
		await apiGet(`/api/v1/inbox?workspaceId=${ws1.id}`, wsAdmin)
	).json()) as Array<{ id: string }>;
	expect(byWs.map((d) => d.id)).toContain(deliveryId);

	// Item read: admins read the delivery; an outsider does not.
	expect((await apiGet(`/api/v1/inbox/${deliveryId}`, iAdmin)).status).toBe(
		200,
	);
	expect((await apiGet(`/api/v1/inbox/${deliveryId}`, wsAdmin)).status).toBe(
		200,
	);
	expect((await apiGet(`/api/v1/inbox/${deliveryId}`, outsider)).status).toBe(
		404,
	);
});

it("lets admins read agents without leaking token secrets", async () => {
	const { iAdmin, wsAdmin, member, outsider, ws1 } = await setup();
	const memberId = await userId(member);
	await apiJson(
		"PATCH",
		"/api/v1/instance/agents",
		{ agentsEnabled: true },
		iAdmin,
	);
	const agent = (await (
		await apiJson(
			"POST",
			"/api/v1/agents",
			{ type: "claude_code", name: "CC", defaultWorkspaceId: ws1.id },
			member,
		)
	).json()) as { id: string };

	// Instance admin reads the user's agents (R); workspace admin reads agents
	// bound to / active in the workspace (R*). No token hash is ever returned.
	const byUser = (await (
		await apiGet(`/api/v1/agents?ownerUserId=${memberId}`, iAdmin)
	).json()) as Array<{ id: string; token: Record<string, unknown> | null }>;
	expect(byUser.map((a) => a.id)).toContain(agent.id);
	expect(byUser[0]?.token).not.toHaveProperty("tokenHash");
	expect(byUser[0]).not.toHaveProperty("userId");

	const byWs = (await (
		await apiGet(`/api/v1/agents?workspaceId=${ws1.id}`, wsAdmin)
	).json()) as Array<{ id: string }>;
	expect(byWs.map((a) => a.id)).toContain(agent.id);

	// A non-member non-admin cannot read by workspace.
	expect(
		(await apiGet(`/api/v1/agents?workspaceId=${ws1.id}`, outsider)).status,
	).toBe(404);
});

it("lets only instance admins read another user's token metadata", async () => {
	const { iAdmin, wsAdmin, member } = await setup();
	const memberId = await userId(member);
	const created = await apiJson(
		"POST",
		"/api/v1/tokens",
		{ name: "CI", scopes: ["read"] },
		member,
	);
	expect(created.status).toBe(201);

	const meta = (await (
		await apiGet(`/api/v1/tokens?ownerUserId=${memberId}`, iAdmin)
	).json()) as Array<Record<string, unknown>>;
	expect(meta).toHaveLength(1);
	// Only metadata: never the hash, the owner id, or a plaintext secret.
	expect(meta[0]).not.toHaveProperty("tokenHash");
	expect(meta[0]).not.toHaveProperty("userId");
	expect(meta[0]).not.toHaveProperty("token");

	// Tokens have no workspace dimension: a workspace admin cannot read them.
	expect(
		(await apiGet(`/api/v1/tokens?ownerUserId=${memberId}`, wsAdmin)).status,
	).toBe(403);
});
