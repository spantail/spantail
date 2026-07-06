import { env } from "cloudflare:workers";
import { createDb, schema } from "@spantail/db";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
	TEST_AUTH_SECRET,
	TEST_CLIENT_SECRET,
	TEST_PKCS1_PEM,
	TEST_WEBHOOK_SECRET,
} from "../../../test/github-fixtures";
import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";
import { setGithubFetchForTests } from "../lib/github/api";
import { clearInstallationTokenCache } from "../lib/github/app-auth";
import { encryptSecret, toBase64 } from "../lib/github/crypto";
import { privateKeyPemToPkcs8Der } from "../lib/github/pkcs8";

const db = () => createDb(env.DB);

let issueStatus = 200;
let pullsByHead: unknown[] = [];

function stubGithubFetch(): void {
	setGithubFetchForTests(async (input, init) => {
		const url = String(input);
		if (url.includes("/access_tokens")) {
			return Response.json(
				{
					token: "itok",
					expires_at: new Date(Date.now() + 3_600_000).toISOString(),
				},
				{ status: 201 },
			);
		}
		if (/\/issues\/\d+$/.test(url)) {
			return Response.json(
				{ title: "Fix auth bug", labels: [{ name: "bug" }], html_url: "" },
				{ status: issueStatus },
			);
		}
		if (url.includes("/installation/repositories")) {
			return Response.json({
				repositories: [
					{ id: 1010, full_name: "acme/spantail", private: true },
					{ id: 1011, full_name: "Acme/Other", private: false },
				],
			});
		}
		if (url.includes("/pulls?head=")) {
			const head = new URL(url).searchParams.get("head") ?? "";
			return Response.json(head.endsWith(":feature-x") ? pullsByHead : []);
		}
		throw new Error(`unstubbed GitHub call: ${init?.method ?? "GET"} ${url}`);
	});
}

beforeEach(() => {
	issueStatus = 200;
	pullsByHead = [];
	clearInstallationTokenCache();
	stubGithubFetch();
});

afterEach(() => setGithubFetchForTests(null));

async function setup(opts?: { withApp?: boolean }) {
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
	const { token } = (await (
		await apiJson(
			"POST",
			"/api/v1/tokens",
			{ name: "dev", scopes: ["read", "write"] },
			member,
		)
	).json()) as { token: string };

	if (opts?.withApp !== false) {
		const pkcs8 = privateKeyPemToPkcs8Der(TEST_PKCS1_PEM);
		if (!pkcs8) throw new Error("fixture key failed to convert");
		await db()
			.insert(schema.githubAppConfig)
			.values({
				id: "singleton",
				appId: 4242,
				slug: "spantail-test",
				ownerLogin: "acme",
				clientId: "Iv1.testclient",
				privateKeyEnc: await encryptSecret(TEST_AUTH_SECRET, toBase64(pkcs8)),
				webhookSecretEnc: await encryptSecret(
					TEST_AUTH_SECRET,
					TEST_WEBHOOK_SECRET,
				),
				clientSecretEnc: await encryptSecret(
					TEST_AUTH_SECRET,
					TEST_CLIENT_SECRET,
				),
			});
		await db().insert(schema.githubInstallations).values({
			id: crypto.randomUUID(),
			installationId: 555,
			accountLogin: "acme",
			accountType: "Organization",
		});
	}
	await db()
		.insert(schema.githubRepoMappings)
		.values({
			id: crypto.randomUUID(),
			repoFullName: "acme/spantail",
			repoId: opts?.withApp === false ? null : 1010,
			projectId: project.id,
			workspaceId: ws.id,
			source: opts?.withApp === false ? "manual" : "installation",
			installationId: opts?.withApp === false ? null : 555,
		});
	return { admin, member, memberId, ws, project, token };
}

function logWork(
	token: string,
	body: unknown,
	client?: string,
): Promise<Response> {
	return appFetch("/api/v1/github/log-work", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
			...(client ? { "x-spantail-client": client } : {}),
		},
		body: JSON.stringify(body),
	});
}

const REMOTES = ["git@github.com:acme/spantail.git"];

it("logs work against a mapped repo with issue enrichment", async () => {
	const ctx = await setup();
	const res = await logWork(
		ctx.token,
		{ remotes: REMOTES, issueNumber: 5, args: "1h30m 2026-07-04" },
		"mcp",
	);
	expect(res.status).toBe(201);
	const { entry, resolved } = (await res.json()) as {
		entry: Record<string, unknown>;
		resolved: Record<string, unknown>;
	};
	expect(entry).toMatchObject({
		workspaceId: ctx.ws.id,
		projectId: ctx.project.id,
		userId: ctx.memberId,
		durationMinutes: 90,
		entryDate: "2026-07-04",
		description: "Fix auth bug (#5)",
		tags: ["bug"],
		source: "mcp",
	});
	expect(resolved).toMatchObject({
		repo: "acme/spantail",
		projectName: "Spantail",
		degraded: false,
		issue: {
			number: 5,
			title: "Fix auth bug",
			url: "https://github.com/acme/spantail/issues/5",
		},
	});
	const refs = await db().select().from(schema.workEntryGithubRefs).all();
	expect(refs).toMatchObject([
		{ repoFullName: "acme/spantail", issueNumber: 5, commentId: null },
	]);
});

it("works in degraded mode without an App", async () => {
	const ctx = await setup({ withApp: false });
	const res = await logWork(ctx.token, {
		remotes: REMOTES,
		issueNumber: 7,
		args: "2h",
	});
	expect(res.status).toBe(201);
	const { entry, resolved } = (await res.json()) as {
		entry: Record<string, unknown>;
		resolved: Record<string, unknown>;
	};
	expect(entry).toMatchObject({
		description: "#7",
		note: "https://github.com/acme/spantail/issues/7",
		tags: [],
	});
	expect(resolved).toMatchObject({ degraded: true });
});

it("degrades instead of failing when the GitHub API errors", async () => {
	const ctx = await setup();
	issueStatus = 500;
	const res = await logWork(ctx.token, {
		remotes: REMOTES,
		issueNumber: 5,
		args: "2h",
	});
	expect(res.status).toBe(201);
	expect(
		((await res.json()) as { resolved: { degraded: boolean } }).resolved
			.degraded,
	).toBe(true);
});

it("rejects unmapped repos with a settings pointer", async () => {
	const ctx = await setup();
	const res = await logWork(ctx.token, {
		remotes: ["https://github.com/acme/unmapped.git"],
		issueNumber: 5,
		args: "2h",
	});
	expect(res.status).toBe(404);
	const { error } = (await res.json()) as { error: { message: string } };
	expect(error.message).toContain("acme/unmapped");
	expect(error.message).toContain("/settings/integrations");
});

it("rejects remote lists without a github.com repo", async () => {
	const ctx = await setup();
	const res = await logWork(ctx.token, {
		remotes: ["/home/me/repo", "https://gitlab.com/x/y.git"],
		issueNumber: 5,
		args: "2h",
	});
	expect(res.status).toBe(400);
});

it("hides mappings of foreign workspaces", async () => {
	const ctx = await setup();
	// A user with no membership anywhere:
	await signUpUser("Stranger", "stranger@example.com");
	const stranger = await signUpUser("Stranger2", "stranger2@example.com");
	const { token } = (await (
		await apiJson(
			"POST",
			"/api/v1/tokens",
			{ name: "s", scopes: ["read", "write"] },
			stranger,
		)
	).json()) as { token: string };
	const res = await logWork(token, {
		remotes: REMOTES,
		issueNumber: 5,
		args: "2h",
	});
	expect(res.status).toBe(404);
	void ctx;
});

it("maps parse errors to 400 with the grammar message", async () => {
	const ctx = await setup();
	for (const [args, fragment] of [
		["abc", "duration"],
		["2h tomorrowish", "date"],
		["2h yesterday extra", "<duration> [date]"],
	] as const) {
		const res = await logWork(ctx.token, {
			remotes: REMOTES,
			issueNumber: 5,
			args,
		});
		expect(res.status).toBe(400);
		const { error } = (await res.json()) as { error: { message: string } };
		expect(error.message.toLowerCase()).toContain(fragment.toLowerCase());
	}
});

it("links agent sessions by refs, branch convention, and PR lookup", async () => {
	const ctx = await setup();
	const agentId = crypto.randomUUID();
	await db().insert(schema.agents).values({
		id: agentId,
		userId: ctx.memberId,
		type: "claude_code",
		name: "cc",
	});
	const mkEntry = (id: string, context: Record<string, string[] | undefined>) =>
		db()
			.insert(schema.agentEntries)
			.values({
				id,
				workspaceId: ctx.ws.id,
				ownerUserId: ctx.memberId,
				projectId: ctx.project.id,
				agentId,
				sessionId: id,
				durationMinutes: 30,
				usage: null,
				context: {
					repositories: ["https://github.com/acme/spantail"],
					...context,
				},
				rollupEventCount: null,
				startedAt: new Date("2026-07-01T10:00:00Z"),
				endedAt: null,
			});
	await mkEntry("by-ref", { refs: ["github:acme/spantail#5"], branches: [] });
	await mkEntry("by-branch", { branches: ["5-fix-auth"] });
	await mkEntry("by-pr", { branches: ["feature-x"] });
	await mkEntry("unrelated", { branches: ["main"] });
	pullsByHead = [{ number: 99, title: "Feature X", body: "Fixes #5" }];

	const res = await logWork(ctx.token, {
		remotes: REMOTES,
		issueNumber: 5,
		args: "2h",
	});
	const { resolved } = (await res.json()) as {
		resolved: { linkedAgentEntryIds: string[] };
	};
	expect(resolved.linkedAgentEntryIds.sort()).toEqual([
		"by-branch",
		"by-pr",
		"by-ref",
	]);
});

it("manages workspace repo mappings with admin gating and 409 on conflicts", async () => {
	const ctx = await setup();
	const list = await apiGet(
		`/api/v1/workspaces/${ctx.ws.id}/github-mappings`,
		ctx.member,
	);
	expect(list.status).toBe(200);
	expect(((await list.json()) as unknown[]).length).toBe(1);

	// Members cannot create mappings.
	const forbidden = await apiJson(
		"POST",
		`/api/v1/workspaces/${ctx.ws.id}/github-mappings`,
		{ repoFullName: "Acme/Other", projectId: ctx.project.id },
		ctx.member,
	);
	expect(forbidden.status).toBe(403);

	const created = await apiJson(
		"POST",
		`/api/v1/workspaces/${ctx.ws.id}/github-mappings`,
		{ repoFullName: "Acme/Other", projectId: ctx.project.id },
		ctx.admin,
	);
	expect(created.status).toBe(201);
	const mapping = (await created.json()) as {
		id: string;
		repoFullName: string;
		source: string;
	};
	// Stored lowercased (GitHub full names are case-insensitive), and — since
	// an installation covers this repo — with server-resolved installation
	// identity rather than a bare manual row.
	expect(mapping.repoFullName).toBe("acme/other");
	expect(mapping.source).toBe("installation");
	const row = (await db().select().from(schema.githubRepoMappings).all()).find(
		(m) => m.repoFullName === "acme/other",
	);
	expect(row).toMatchObject({ repoId: 1011, installationId: 555 });

	// A repo no installation covers stays a manual mapping.
	const project2 = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ctx.ws.id}/projects`,
			{ slug: "ops", name: "Ops", memberUserIds: [ctx.memberId] },
			ctx.admin,
		)
	).json()) as { id: string };
	const manual = await apiJson(
		"POST",
		`/api/v1/workspaces/${ctx.ws.id}/github-mappings`,
		{ repoFullName: "acme/elsewhere", projectId: project2.id },
		ctx.admin,
	);
	expect(manual.status).toBe(201);
	expect(((await manual.json()) as { source: string }).source).toBe("manual");

	const conflict = await apiJson(
		"POST",
		`/api/v1/workspaces/${ctx.ws.id}/github-mappings`,
		{ repoFullName: "acme/other", projectId: ctx.project.id },
		ctx.admin,
	);
	expect(conflict.status).toBe(409);

	const removed = await apiJson(
		"DELETE",
		`/api/v1/workspaces/${ctx.ws.id}/github-mappings/${mapping.id}`,
		undefined,
		ctx.admin,
	);
	expect(removed.status).toBe(204);
});

it("requires the admin PAT scope for mapping writes", async () => {
	const ctx = await setup();
	// A write-scope (non-admin) PAT of the workspace ADMIN: role alone must
	// not be enough — mapping writes need the admin token scope like other
	// workspace-admin writes.
	const { token } = (await (
		await apiJson(
			"POST",
			"/api/v1/tokens",
			{ name: "rw", scopes: ["read", "write"] },
			ctx.admin,
		)
	).json()) as { token: string };
	const res = await appFetch(
		`/api/v1/workspaces/${ctx.ws.id}/github-mappings`,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				repoFullName: "acme/scoped",
				projectId: ctx.project.id,
			}),
		},
	);
	expect(res.status).toBe(403);
});

it("exposes and clears the caller's github identity", async () => {
	const ctx = await setup();
	expect(await (await apiGet("/api/v1/me/github", ctx.member)).json()).toEqual({
		linked: false,
	});

	await db().insert(schema.githubIdentities).values({
		id: crypto.randomUUID(),
		githubUserId: 777,
		userId: ctx.memberId,
		login: "octocat",
	});
	expect(await (await apiGet("/api/v1/me/github", ctx.member)).json()).toEqual({
		linked: true,
		login: "octocat",
	});

	const res = await apiJson(
		"DELETE",
		"/api/v1/me/github",
		undefined,
		ctx.member,
	);
	expect(res.status).toBe(204);
	expect(await (await apiGet("/api/v1/me/github", ctx.member)).json()).toEqual({
		linked: false,
	});
});

it("creates the entry through the MCP tool with source mcp", async () => {
	const ctx = await setup();
	const res = await appFetch("/mcp", {
		method: "POST",
		headers: {
			authorization: `Bearer ${ctx.token}`,
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: {
				name: "log_work_github",
				arguments: { remotes: REMOTES, issueNumber: 5, args: "45m" },
			},
		}),
	});
	expect(res.status).toBe(200);
	const entries = await db().select().from(schema.workEntries).all();
	expect(entries).toHaveLength(1);
	expect(entries[0]).toMatchObject({ durationMinutes: 45, source: "mcp" });
});
