import { env } from "cloudflare:workers";
import { generateShareToken } from "@toxil/core";
import { createDb, createReportShare } from "@toxil/db";
import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

/**
 * Builds a report whose markdown carries injection attempts: the report note
 * flows verbatim into the builtin daily template's Notes section.
 */
async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			admin,
		)
	).json()) as { id: string };
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "toxil", name: "Toxil" },
			admin,
		)
	).json()) as { id: string };
	const entry = await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws.id,
			projectId: project.id,
			durationMinutes: 30,
			description: "Wired the share view",
		},
		admin,
	);
	expect(entry.status).toBe(201);
	const report = await apiJson(
		"POST",
		"/api/v1/reports",
		{
			name: "Daily <Report>",
			templateId: "builtin:daily",
			filters: { workspaceIds: [ws.id], dateRange: "today" },
			note: "<script>alert(1)</script> and [a link](javascript:alert(1))",
		},
		admin,
	);
	expect(report.status).toBe(201);
	const reportId = ((await report.json()) as { id: string }).id;
	return { admin, reportId };
}

async function createShare(
	admin: string,
	reportId: string,
	body: Record<string, unknown> = {},
): Promise<{ id: string; token: string }> {
	const res = await apiJson(
		"POST",
		`/api/v1/reports/${reportId}/shares`,
		body,
		admin,
	);
	expect(res.status).toBe(201);
	return (await res.json()) as { id: string; token: string };
}

async function listShares(admin: string, reportId: string) {
	return (await (
		await apiGet(`/api/v1/reports/${reportId}/shares`, admin)
	).json()) as Array<{
		id: string;
		viewCount: number;
		lastViewedAt: string | null;
	}>;
}

it("serves shared content with hardening headers and sanitized markdown", async () => {
	const { admin, reportId } = await setup();
	const share = await createShare(admin, reportId);

	const res = await appFetch(`/share/${share.token}`);
	expect(res.status).toBe(200);
	expect(res.headers.get("content-type")).toContain("text/html");
	expect(res.headers.get("x-robots-tag")).toBe("noindex");
	expect(res.headers.get("cache-control")).toBe("no-store");
	expect(res.headers.get("referrer-policy")).toBe("no-referrer");
	expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	expect(res.headers.get("content-security-policy")).toContain(
		"default-src 'none'",
	);

	const body = await res.text();
	expect(body).toContain('name="robots"');
	// The report name is HTML-escaped, the entry shows, and the injection
	// attempts in the note are neutralized.
	expect(body).toContain("Daily &lt;Report&gt;");
	expect(body).toContain("Wired the share view");
	expect(body).not.toContain("<script>");
	expect(body).not.toContain("javascript:");
});

it("increments the view count on successful views only", async () => {
	const { admin, reportId } = await setup();
	const share = await createShare(admin, reportId);

	expect((await appFetch(`/share/${share.token}`)).status).toBe(200);
	expect((await appFetch(`/share/${share.token}`)).status).toBe(200);

	const [row] = await listShares(admin, reportId);
	expect(row?.viewCount).toBe(2);
	expect(row?.lastViewedAt).toBeTruthy();
});

it("guards passcode-protected shares", async () => {
	const { admin, reportId } = await setup();
	const share = await createShare(admin, reportId, {
		passcode: "open sesame",
	});

	const form = await appFetch(`/share/${share.token}`);
	expect(form.status).toBe(200);
	const formBody = await form.text();
	expect(formBody).toContain('name="passcode"');
	expect(formBody).not.toContain("Wired the share view");
	expect((await listShares(admin, reportId))[0]?.viewCount).toBe(0);

	const postForm = (passcode: string) =>
		appFetch(`/share/${share.token}`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ passcode }).toString(),
		});

	const wrong = await postForm("nope nope");
	expect(wrong.status).toBe(401);
	expect(await wrong.text()).toContain('name="passcode"');
	expect((await listShares(admin, reportId))[0]?.viewCount).toBe(0);

	const right = await postForm("open sesame");
	expect(right.status).toBe(200);
	expect(await right.text()).toContain("Wired the share view");
	expect((await listShares(admin, reportId))[0]?.viewCount).toBe(1);
});

it("returns a uniform 404 for invalid, unknown, revoked, and expired links", async () => {
	const { admin, reportId } = await setup();

	const revoked = await createShare(admin, reportId);
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/report-shares/${revoked.id}/revoke`,
				undefined,
				admin,
			)
		).status,
	).toBe(200);

	// An expired share cannot be minted via the API; insert it directly. The
	// expiry check fires before any R2 read, so no object is needed.
	const expired = await createReportShare(createDb(env.DB), {
		reportId,
		token: generateShareToken(),
		r2Key: `shares/${generateShareToken()}`,
		reportName: "Expired",
		dateFrom: "2026-01-01",
		dateTo: "2026-01-01",
		passcodeHash: null,
		expiresAt: new Date(Date.now() - 1000),
	});

	const responses = await Promise.all([
		appFetch("/share/not-a-token"),
		appFetch(`/share/${generateShareToken()}`),
		appFetch(`/share/${revoked.token}`),
		appFetch(`/share/${expired.token}`),
	]);
	const bodies = await Promise.all(responses.map((r) => r.text()));
	for (const res of responses) {
		expect(res.status).toBe(404);
		expect(res.headers.get("x-robots-tag")).toBe("noindex");
	}
	// Byte-identical bodies: the page must not reveal why a link is dead.
	expect(new Set(bodies).size).toBe(1);
	expect(bodies[0]).toContain("invalid or has expired");
});

it("serves Japanese chrome for Accept-Language: ja", async () => {
	const res = await appFetch(`/share/${generateShareToken()}`, {
		headers: { "accept-language": "ja,en;q=0.8" },
	});
	expect(res.status).toBe(404);
	expect(await res.text()).toContain("この共有リンクは無効か、期限切れです。");
});

it("returns the HTML 404 for deep paths and stray methods", async () => {
	const { admin, reportId } = await setup();
	const share = await createShare(admin, reportId);

	const deep = await appFetch("/share/a/b");
	expect(deep.status).toBe(404);
	expect(deep.headers.get("content-type")).toContain("text/html");

	const patch = await appFetch(`/share/${share.token}`, { method: "PATCH" });
	expect(patch.status).toBe(404);
	expect(patch.headers.get("content-type")).toContain("text/html");
	expect((await listShares(admin, reportId))[0]?.viewCount).toBe(0);
});
