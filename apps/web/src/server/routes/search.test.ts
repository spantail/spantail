import { expect, it } from "vitest";

import {
	apiGet,
	apiJson,
	defaultTemplateId,
	signUpUser,
} from "../../../test/helpers";

type SearchResult = {
	workEntries: Array<{ id: string; description: string }>;
	reports: Array<{ id: string; name: string }>;
};

// The first signed-up user is the bootstrap instance admin; `member` is a plain
// member, used to prove the project ACL actually scopes results.
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
	// A project the member belongs to, and one they do not.
	const shared = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "shared", name: "Shared", memberUserIds: [memberId] },
			admin,
		)
	).json()) as { id: string };
	const secret = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "secret", name: "Secret" },
			admin,
		)
	).json()) as { id: string };
	return { admin, member, ws, shared, secret };
}

const mkEntry = (
	cookie: string,
	wsId: string,
	projectId: string,
	description: string,
	tags: string[] = [],
) =>
	apiJson(
		"POST",
		"/api/v1/work-entries",
		{ workspaceId: wsId, projectId, durationMinutes: 30, description, tags },
		cookie,
	);

const search = async (q: string, cookie?: string) =>
	(await (
		await apiGet(`/api/v1/search?q=${encodeURIComponent(q)}`, cookie)
	).json()) as SearchResult;

it("matches work entries by description, case-insensitively", async () => {
	const { admin, ws, shared } = await setup();
	await mkEntry(admin, ws.id, shared.id, "Implemented the API parser");

	// Mixed-case query matches (both sides are lowercased).
	const hit = await search("API PARSER", admin);
	expect(hit.workEntries.map((e) => e.description)).toEqual([
		"Implemented the API parser",
	]);

	// LIKE is a substring match, not a token match: reordered words miss.
	expect((await search("parser api", admin)).workEntries).toHaveLength(0);
});

it("matches Japanese (CJK) substrings and tags", async () => {
	const { admin, ws, shared } = await setup();
	await mkEntry(admin, ws.id, shared.id, "日本語のレポートを作成した", [
		"設計",
	]);

	const byText = await search("レポート", admin);
	expect(byText.workEntries).toHaveLength(1);

	const byTag = await search("設計", admin);
	expect(byTag.workEntries).toHaveLength(1);
});

it("scopes work-entry results by the project ACL", async () => {
	const { admin, member, ws, secret } = await setup();
	// Admin logs an entry in a project the member is not part of.
	await mkEntry(admin, ws.id, secret.id, "Confidential migration plan");

	// The instance admin sees it; the plain member does not.
	expect((await search("confidential", admin)).workEntries).toHaveLength(1);
	expect((await search("confidential", member)).workEntries).toHaveLength(0);
});

it("treats LIKE wildcards in the query literally", async () => {
	const { admin, ws, shared } = await setup();
	await mkEntry(admin, ws.id, shared.id, "plain description");
	await mkEntry(admin, ws.id, shared.id, "100% complete");

	// A bare "%" must not match every entry — it is escaped to a literal.
	const wildcard = await search("%", admin);
	expect(wildcard.workEntries.map((e) => e.description)).toEqual([
		"100% complete",
	]);
});

it("scopes report results to the owner", async () => {
	const { admin, member, ws } = await setup();
	const templateId = await defaultTemplateId(admin);
	const created = await apiJson(
		"POST",
		"/api/v1/reports",
		{
			name: "Quarterly standup digest",
			templateId,
			filters: { workspaceIds: [ws.id], dateRange: "today" },
		},
		admin,
	);
	expect(created.status).toBe(201);

	expect((await search("standup", admin)).reports).toHaveLength(1);
	// Reports are owner-private; a workspace member cannot find another's report.
	expect((await search("standup", member)).reports).toHaveLength(0);
});

it("rejects anonymous callers and a missing query", async () => {
	const { admin } = await setup();
	expect((await apiGet("/api/v1/search?q=anything")).status).toBe(401);
	expect((await apiGet("/api/v1/search", admin)).status).toBe(400);
	expect((await apiGet("/api/v1/search?q=", admin)).status).toBe(400);
});
