import { env } from "cloudflare:workers";
import { generatePat, hashPat, isShareTokenFormat } from "@spantail/core";
import { createApiToken, createDb, getReportShareByToken } from "@spantail/db";
import { expect, it } from "vitest";

import {
	apiGet,
	apiJson,
	appFetch,
	defaultTemplateId,
	signUpUser,
} from "../../../test/helpers";

/**
 * Owner + one recipient sharing a workspace, one report delivered to the
 * recipient's inbox. Returns the recipient's delivery id — the subject of the
 * inbox share routes.
 */
async function setup() {
	const owner = await signUpUser("Owner", "owner@example.com");
	const alice = await signUpUser("Alice", "alice@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme" },
			owner,
		)
	).json()) as { id: string };
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "alice@example.com" },
		owner,
	);
	const aliceId = (
		(await (await apiGet("/api/v1/me", alice)).json()) as {
			user: { id: string };
		}
	).user.id;
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
	const sent = await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/send`,
		{ recipientUserIds: [aliceId] },
		owner,
	);
	expect(sent.status).toBe(201);
	const inbox = (await (
		await apiGet("/api/v1/inbox?folder=inbox", alice)
	).json()) as Array<{ id: string }>;
	const deliveryId = inbox[0]?.id as string;
	expect(deliveryId).toBeTruthy();
	return { owner, alice, aliceId, ws, report, deliveryId };
}

async function mintToken(
	cookie: string,
	scopes: Array<"read" | "write">,
): Promise<string> {
	const me = (await (await apiGet("/api/v1/me", cookie)).json()) as {
		user: { id: string };
	};
	const token = generatePat();
	await createApiToken(createDb(env.DB), {
		userId: me.user.id,
		name: "test",
		tokenHash: await hashPat(token),
		scopes,
		expiresAt: null,
	});
	return token;
}

it("lets the recipient mint and list shares over the delivered version", async () => {
	const { alice, deliveryId } = await setup();

	const created = await apiJson(
		"POST",
		`/api/v1/inbox/${deliveryId}/shares`,
		{ expiresInDays: 7, passcode: "open sesame" },
		alice,
	);
	expect(created.status).toBe(201);
	const share = (await created.json()) as Record<string, unknown>;
	expect(isShareTokenFormat(share.token as string)).toBe(true);
	expect(share.hasPasscode).toBe(true);
	expect(typeof share.reportContentId).toBe("string");
	expect(share).not.toHaveProperty("passcodeHash");
	expect(share).not.toHaveProperty("createdByUserId");

	// A body-less POST is fine: every field is optional.
	const bare = await appFetch(`/api/v1/inbox/${deliveryId}/shares`, {
		method: "POST",
		headers: { cookie: alice },
	});
	expect(bare.status).toBe(201);
	const bareShare = (await bare.json()) as { token: string };

	const list = (await (
		await apiGet(`/api/v1/inbox/${deliveryId}/shares`, alice)
	).json()) as Array<Record<string, unknown>>;
	expect(list).toHaveLength(2);
	for (const row of list) {
		expect(row).not.toHaveProperty("passcodeHash");
		expect(row).not.toHaveProperty("createdByUserId");
	}

	// The public page serves the delivered body (the version that was sent).
	const page = await appFetch(`/share/${bareShare.token}`);
	expect(page.status).toBe(200);
	expect(await page.text()).toContain("Daily");

	// The passcode-protected link gates on the passcode.
	const gated = await appFetch(`/share/${share.token as string}`);
	expect(await gated.text()).toContain('name="passcode"');
	const wrong = await appFetch(`/share/${share.token as string}`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ passcode: "nope nope" }).toString(),
	});
	expect(wrong.status).toBe(401);
});

it("hides the routes from the sender and unrelated users", async () => {
	const { owner, deliveryId } = await setup();
	const stranger = await signUpUser("Mallory", "mallory@example.com");

	// The sender is not the recipient of this copy (no self-send here), and a
	// sent-scope view of the batch never grants share access either.
	for (const cookie of [owner, stranger]) {
		expect(
			(await apiJson("POST", `/api/v1/inbox/${deliveryId}/shares`, {}, cookie))
				.status,
		).toBe(404);
		expect(
			(await apiGet(`/api/v1/inbox/${deliveryId}/shares`, cookie)).status,
		).toBe(404);
	}
});

it("keeps working after the recipient loses workspace membership (email model)", async () => {
	const { owner, alice, aliceId, ws, deliveryId } = await setup();
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

	// The received copy is the recipient's (they can already download it), so
	// minting and listing require no live workspace membership.
	const created = await apiJson(
		"POST",
		`/api/v1/inbox/${deliveryId}/shares`,
		{},
		alice,
	);
	expect(created.status).toBe(201);
	const share = (await created.json()) as { token: string };
	expect((await appFetch(`/share/${share.token}`)).status).toBe(200);
	expect(
		(await apiGet(`/api/v1/inbox/${deliveryId}/shares`, alice)).status,
	).toBe(200);
});

it("lets only the recipient revoke, idempotently", async () => {
	const { owner, alice, deliveryId } = await setup();
	const share = (await (
		await apiJson("POST", `/api/v1/inbox/${deliveryId}/shares`, {}, alice)
	).json()) as { id: string; token: string };

	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/report-shares/${share.id}/revoke`,
				undefined,
				owner,
			)
		).status,
	).toBe(404);

	const first = await apiJson(
		"POST",
		`/api/v1/report-shares/${share.id}/revoke`,
		undefined,
		alice,
	);
	expect(first.status).toBe(200);
	const revokedAt = ((await first.json()) as { revokedAt: string }).revokedAt;
	expect(revokedAt).toBeTruthy();
	expect((await appFetch(`/share/${share.token}`)).status).toBe(404);

	const second = await apiJson(
		"POST",
		`/api/v1/report-shares/${share.id}/revoke`,
		undefined,
		alice,
	);
	expect(second.status).toBe(200);
	expect(((await second.json()) as { revokedAt: string }).revokedAt).toBe(
		revokedAt,
	);
});

it("cascades delivery shares away with the report", async () => {
	const { owner, alice, report, deliveryId } = await setup();
	const share = (await (
		await apiJson("POST", `/api/v1/inbox/${deliveryId}/shares`, {}, alice)
	).json()) as { token: string };
	const db = createDb(env.DB);
	expect(await getReportShareByToken(db, share.token)).toBeDefined();

	expect(
		(await apiJson("DELETE", `/api/v1/reports/${report.id}`, undefined, owner))
			.status,
	).toBe(204);
	// Report → content → share (and report → delivery) all cascade.
	expect(await getReportShareByToken(db, share.token)).toBeUndefined();
	expect((await appFetch(`/share/${share.token}`)).status).toBe(404);
	expect((await apiGet(`/api/v1/inbox/${deliveryId}`, alice)).status).toBe(404);
});

it("keeps serving the sent version after the report is edited", async () => {
	const { owner, alice, ws, report, deliveryId } = await setup();
	const edited = await apiJson(
		"PATCH",
		`/api/v1/reports/${report.id}`,
		{
			name: "Edited",
			templateId: await defaultTemplateId(owner),
			filters: { workspaceIds: [ws.id], dateRange: "today" },
		},
		owner,
	);
	expect(edited.status).toBe(200);

	// Minted after the edit, the share still references the delivered version.
	const share = (await (
		await apiJson("POST", `/api/v1/inbox/${deliveryId}/shares`, {}, alice)
	).json()) as { token: string };
	const row = await getReportShareByToken(createDb(env.DB), share.token);
	expect(row?.content).toBe(report.renderedMarkdown);
	const page = await appFetch(`/share/${share.token}`);
	const body = await page.text();
	expect(body).toContain("Daily");
	expect(body).not.toContain("Edited");
});

it("enforces PAT scopes on inbox share management", async () => {
	const { alice, deliveryId } = await setup();
	const readToken = await mintToken(alice, ["read"]);
	const writeToken = await mintToken(alice, ["read", "write"]);

	const denied = await appFetch(`/api/v1/inbox/${deliveryId}/shares`, {
		method: "POST",
		headers: { authorization: `Bearer ${readToken}` },
	});
	expect(denied.status).toBe(403);
	expect(
		((await denied.json()) as { error: { code: string } }).error.code,
	).toBe("insufficient_scope");

	expect(
		(
			await appFetch(`/api/v1/inbox/${deliveryId}/shares`, {
				headers: { authorization: `Bearer ${readToken}` },
			})
		).status,
	).toBe(200);
	expect(
		(
			await appFetch(`/api/v1/inbox/${deliveryId}/shares`, {
				method: "POST",
				headers: { authorization: `Bearer ${writeToken}` },
			})
		).status,
	).toBe(201);
});

it("repairs a rollout-window delivery lacking its content id", async () => {
	const { alice, deliveryId } = await setup();
	// Simulate a row inserted by a pre-column Worker after the migration
	// backfill already ran: the recorded version id is missing.
	await env.DB.prepare(
		"UPDATE report_deliveries SET report_content_id = NULL WHERE id = ?",
	)
		.bind(deliveryId)
		.run();

	const created = await apiJson(
		"POST",
		`/api/v1/inbox/${deliveryId}/shares`,
		{},
		alice,
	);
	expect(created.status).toBe(201);
	const share = (await created.json()) as { reportContentId: string };
	expect(share.reportContentId).toBeTruthy();

	// The resolved id was written back onto the delivery row.
	const healed = await env.DB.prepare(
		"SELECT report_content_id FROM report_deliveries WHERE id = ?",
	)
		.bind(deliveryId)
		.first<{ report_content_id: string | null }>();
	expect(healed?.report_content_id).toBe(share.reportContentId);
});

it("still shares a trashed message (trash is a folder, not deletion)", async () => {
	const { alice, deliveryId } = await setup();
	expect(
		(
			await apiJson(
				"PATCH",
				"/api/v1/inbox/flags",
				{ scope: "received", targetId: deliveryId, trashed: true },
				alice,
			)
		).status,
	).toBe(204);
	expect(
		(await apiJson("POST", `/api/v1/inbox/${deliveryId}/shares`, {}, alice))
			.status,
	).toBe(201);
});

it("keeps owner and recipient share lists separate", async () => {
	const { owner, alice, report, deliveryId } = await setup();
	const ownerShare = (await (
		await apiJson("POST", `/api/v1/reports/${report.id}/shares`, {}, owner)
	).json()) as { id: string };
	const aliceShare = (await (
		await apiJson("POST", `/api/v1/inbox/${deliveryId}/shares`, {}, alice)
	).json()) as { id: string };

	// Both shares reference the same content version, but each list shows only
	// the caller's own links.
	const ownerList = (await (
		await apiGet(`/api/v1/reports/${report.id}/shares`, owner)
	).json()) as Array<{ id: string }>;
	expect(ownerList.map((s) => s.id)).toEqual([ownerShare.id]);

	const aliceList = (await (
		await apiGet(`/api/v1/inbox/${deliveryId}/shares`, alice)
	).json()) as Array<{ id: string }>;
	expect(aliceList.map((s) => s.id)).toEqual([aliceShare.id]);
});
