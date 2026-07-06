import { env } from "cloudflare:workers";
import {
	createDb,
	deleteGithubIdentityByUserId,
	getGithubAppConfig,
	getGithubIdentityByUserId,
	getGithubInstallation,
	listGithubInstallations,
	schema,
} from "@spantail/db";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	signWebhookBody,
	TEST_AUTH_SECRET,
	TEST_CLIENT_SECRET,
	TEST_PKCS1_PEM,
	TEST_WEBHOOK_SECRET,
} from "../../../test/github-fixtures";
import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";
import { setGithubFetchForTests } from "../lib/github/api";
import { clearInstallationTokenCache } from "../lib/github/app-auth";
import { handleIssueCommentCreated } from "../lib/github/comment-pipeline";
import { decryptSecret, encryptSecret, toBase64 } from "../lib/github/crypto";
import { privateKeyPemToPkcs8Der } from "../lib/github/pkcs8";

const db = () => createDb(env.DB);

interface RecordedCall {
	method: string;
	url: string;
	body: unknown;
}

let recorded: RecordedCall[] = [];
let issueResponse: { status: number; body?: unknown } = {
	status: 200,
	body: { title: "Fix auth bug", labels: [{ name: "bug" }], html_url: "" },
};

/** Routes the GitHub API surface the integration touches; records writes. */
function stubGithubFetch(): void {
	setGithubFetchForTests(async (input, init) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		recorded.push({ method, url, body });

		if (url.includes("/app/installations/") && url.endsWith("/access_tokens")) {
			return Response.json(
				{
					token: "test-installation-token",
					expires_at: new Date(Date.now() + 3_600_000).toISOString(),
				},
				{ status: 201 },
			);
		}
		if (/\/repos\/[^/]+\/[^/]+\/issues\/\d+$/.test(url)) {
			return Response.json(issueResponse.body ?? {}, {
				status: issueResponse.status,
			});
		}
		if (url.includes("/comments") && url.includes("/reactions")) {
			return Response.json({}, { status: 201 });
		}
		if (/\/issues\/\d+\/comments$/.test(url)) {
			return Response.json({}, { status: 201 });
		}
		if (url.includes("/app-manifests/")) {
			return Response.json(
				{
					id: 4242,
					slug: "spantail-test",
					client_id: "Iv1.testclient",
					client_secret: TEST_CLIENT_SECRET,
					webhook_secret: TEST_WEBHOOK_SECRET,
					pem: TEST_PKCS1_PEM,
					owner: { login: "acme" },
				},
				{ status: 201 },
			);
		}
		if (url === "https://github.com/login/oauth/access_token") {
			return Response.json({ access_token: "user-token" });
		}
		if (url.endsWith("/user")) {
			return Response.json({ id: 777, login: "octocat" });
		}
		if (url.includes("/installation/repositories")) {
			return Response.json({
				repositories: [
					{ id: 1010, full_name: "acme/spantail", private: true },
					{ id: 1011, full_name: "acme/other", private: false },
				],
			});
		}
		if (url.includes("/pulls?head=")) {
			return Response.json([]);
		}
		throw new Error(`unstubbed GitHub call: ${method} ${url}`);
	});
}

beforeEach(() => {
	recorded = [];
	issueResponse = {
		status: 200,
		body: { title: "Fix auth bug", labels: [{ name: "bug" }], html_url: "" },
	};
	clearInstallationTokenCache();
	stubGithubFetch();
});

afterEach(() => {
	setGithubFetchForTests(null);
});

async function seedAppConfig(): Promise<void> {
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
}

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
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "spantail", name: "Spantail", memberUserIds: [memberId] },
			admin,
		)
	).json()) as { id: string };
	return { admin, member, memberId, ws, project };
}

async function seedIntegration() {
	const ctx = await setup();
	await seedAppConfig();
	await db().insert(schema.githubInstallations).values({
		id: crypto.randomUUID(),
		installationId: 555,
		accountLogin: "acme",
		accountType: "Organization",
	});
	await db().insert(schema.githubRepoMappings).values({
		id: crypto.randomUUID(),
		repoFullName: "acme/spantail",
		repoId: 1010,
		projectId: ctx.project.id,
		workspaceId: ctx.ws.id,
		source: "installation",
		installationId: 555,
	});
	await db().insert(schema.githubIdentities).values({
		id: crypto.randomUUID(),
		githubUserId: 777,
		userId: ctx.memberId,
		login: "octocat",
	});
	return ctx;
}

function commentPayload(overrides?: {
	body?: string;
	association?: string;
	commentId?: number;
	userId?: number;
	userType?: string;
}) {
	return {
		action: "created",
		comment: {
			id: overrides?.commentId ?? 9001,
			body: overrides?.body ?? "@spantail 2h",
			author_association: overrides?.association ?? "MEMBER",
			created_at: "2026-07-05T12:00:00Z",
			user: {
				id: overrides?.userId ?? 777,
				login: "octocat",
				type: overrides?.userType ?? "User",
			},
		},
		issue: { number: 5 },
		repository: { id: 1010, full_name: "acme/spantail" },
		installation: { id: 555 },
	};
}

async function runPipeline(payload: unknown): Promise<void> {
	const config = await getGithubAppConfig(db());
	if (!config) throw new Error("app config not seeded");
	await handleIssueCommentCreated({
		env: env as Env,
		db: db(),
		origin: "https://example.com",
		config,
		// biome-ignore lint/suspicious/noExplicitAny: test payloads are shaped above
		payload: payload as any,
	});
}

async function listEntries() {
	return db().select().from(schema.workEntries).all();
}

// --- webhook receiver ---

it("rejects webhooks when no App is configured or the signature is bad", async () => {
	const body = JSON.stringify(commentPayload());
	const unconfigured = await appFetch("/api/github/webhook", {
		method: "POST",
		headers: { "x-github-event": "issue_comment" },
		body,
	});
	expect(unconfigured.status).toBe(404);

	await seedIntegration();
	const badSig = await appFetch("/api/github/webhook", {
		method: "POST",
		headers: {
			"x-github-event": "issue_comment",
			"x-hub-signature-256": await signWebhookBody("wrong-secret", body),
		},
		body,
	});
	expect(badSig.status).toBe(401);

	const noSig = await appFetch("/api/github/webhook", {
		method: "POST",
		headers: { "x-github-event": "issue_comment" },
		body,
	});
	expect(noSig.status).toBe(401);
});

it("maintains installations from installation webhooks", async () => {
	await setup();
	await seedAppConfig();
	const post = async (payload: unknown) => {
		const body = JSON.stringify(payload);
		return appFetch("/api/github/webhook", {
			method: "POST",
			headers: {
				"x-github-event": "installation",
				"x-hub-signature-256": await signWebhookBody(TEST_WEBHOOK_SECRET, body),
			},
			body,
		});
	};

	const created = await post({
		action: "created",
		installation: { id: 900, account: { login: "acme", type: "Organization" } },
	});
	expect(created.status).toBe(204);
	expect(await getGithubInstallation(db(), 900)).toMatchObject({
		accountLogin: "acme",
		suspendedAt: null,
	});

	await post({ action: "suspend", installation: { id: 900 } });
	expect((await getGithubInstallation(db(), 900))?.suspendedAt).toBeInstanceOf(
		Date,
	);

	await post({ action: "deleted", installation: { id: 900 } });
	expect(await getGithubInstallation(db(), 900)).toBeUndefined();
});

it("logs work end-to-end from a signed issue_comment webhook", async () => {
	await seedIntegration();
	const body = JSON.stringify(commentPayload());
	const res = await appFetch("/api/github/webhook", {
		method: "POST",
		headers: {
			"x-github-event": "issue_comment",
			"x-hub-signature-256": await signWebhookBody(TEST_WEBHOOK_SECRET, body),
		},
		body,
	});
	expect(res.status).toBe(202);
	await vi.waitFor(async () => {
		expect((await listEntries()).length).toBe(1);
	});
});

// --- comment pipeline (called directly for determinism) ---

it("creates a github-sourced entry with title, labels, ref, and reply", async () => {
	const ctx = await seedIntegration();
	await runPipeline(commentPayload({ body: "@spantail 1h30m 2026-07-04" }));

	const entries = await listEntries();
	expect(entries).toHaveLength(1);
	const entry = entries[0];
	expect(entry).toMatchObject({
		workspaceId: ctx.ws.id,
		projectId: ctx.project.id,
		userId: ctx.memberId,
		durationMinutes: 90,
		entryDate: "2026-07-04",
		description: "Fix auth bug (#5)",
		tags: ["bug"],
		source: "github",
	});

	const refs = await db().select().from(schema.workEntryGithubRefs).all();
	expect(refs).toMatchObject([
		{ repoFullName: "acme/spantail", issueNumber: 5, commentId: 9001 },
	]);

	const reply = recorded.find(
		(call) => call.method === "POST" && call.url.endsWith("/issues/5/comments"),
	);
	expect(reply).toBeDefined();
	expect((reply?.body as { body: string }).body).toContain("Logged 1h 30m");
	expect((reply?.body as { body: string }).body).toContain("1.5h");
	expect(recorded.some((call) => call.url.includes("/reactions"))).toBe(true);
});

it("interprets the date in the author's timezone", async () => {
	const ctx = await seedIntegration();
	await apiJson("PATCH", "/api/v1/me", { timezone: "Asia/Tokyo" }, ctx.member);
	// 12:00Z on 7/5 is 21:00 JST 7/5; "today" must be 7/5, not UTC's 7/5 too —
	// use 20:00Z (7/6 05:00 JST) to make the timezone visible.
	const payload = commentPayload({ body: "@spantail 2h today" });
	payload.comment.created_at = "2026-07-05T20:00:00Z";
	await runPipeline(payload);
	expect((await listEntries())[0]?.entryDate).toBe("2026-07-06");
});

it("degrades to the bare ref when the issue fetch fails", async () => {
	await seedIntegration();
	issueResponse = { status: 500 };
	await runPipeline(commentPayload());
	const entry = (await listEntries())[0];
	expect(entry?.description).toBe("acme/spantail#5");
	expect(entry?.tags).toEqual([]);
});

it("replies with the parse error for malformed commands", async () => {
	await seedIntegration();
	await runPipeline(commentPayload({ body: "@spantail sometime" }));
	expect(await listEntries()).toHaveLength(0);
	const reply = recorded.find((call) =>
		call.url.endsWith("/issues/5/comments"),
	);
	expect((reply?.body as { body: string }).body).toContain(
		"Could not read a duration",
	);
});

it("is idempotent on the comment id", async () => {
	await seedIntegration();
	await runPipeline(commentPayload());
	await runPipeline(commentPayload());
	expect(await listEntries()).toHaveLength(1);
});

it("stays fully silent for outsiders and unmapped repos from outsiders", async () => {
	await seedIntegration();
	// Unlinked outsider: no reply, no reaction, no entry.
	await runPipeline(
		commentPayload({ association: "NONE", userId: 12345, commentId: 9100 }),
	);
	// Bot comments never trigger, even from a linked account.
	await runPipeline(commentPayload({ userType: "Bot", commentId: 9101 }));
	expect(await listEntries()).toHaveLength(0);
	expect(
		recorded.filter((call) => call.url.endsWith("/comments")),
	).toHaveLength(0);
});

it("onboards unlinked insiders with a connect link", async () => {
	await seedIntegration();
	await runPipeline(
		commentPayload({ association: "COLLABORATOR", userId: 424242 }),
	);
	expect(await listEntries()).toHaveLength(0);
	const reply = recorded.find((call) =>
		call.url.endsWith("/issues/5/comments"),
	);
	expect((reply?.body as { body: string }).body).toContain(
		"https://example.com/api/github/connect",
	);
});

it("rejects linked users outside the mapped workspace with a reply", async () => {
	const ctx = await seedIntegration();
	// Re-point the identity to a user who is not a member of the workspace.
	const outsider = await signUpUser("Outsider", "outsider@example.com");
	const outsiderId = (
		(await (await apiGet("/api/v1/me", outsider)).json()) as {
			user: { id: string };
		}
	).user.id;
	await deleteGithubIdentityByUserId(db(), ctx.memberId);
	await db().insert(schema.githubIdentities).values({
		id: crypto.randomUUID(),
		githubUserId: 777,
		userId: outsiderId,
		login: "octocat",
	});

	await runPipeline(commentPayload());
	expect(await listEntries()).toHaveLength(0);
	const reply = recorded.find((call) =>
		call.url.endsWith("/issues/5/comments"),
	);
	expect((reply?.body as { body: string }).body).toContain("not a member");
	void ctx;
});

it("links agent entries whose context matches the issue", async () => {
	const ctx = await seedIntegration();
	// A registered agent with two sessions: one on the issue branch, one not.
	const agentId = crypto.randomUUID();
	await db().insert(schema.agents).values({
		id: agentId,
		userId: ctx.memberId,
		type: "claude-code",
		name: "cc",
	});
	const mkEntry = (id: string, branches: string[]) =>
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
					branches,
				},
				rollupEventCount: null,
				startedAt: new Date("2026-07-04T10:00:00Z"),
				endedAt: null,
			});
	await mkEntry("session-on-issue", ["5-fix-auth"]);
	await mkEntry("session-elsewhere", ["main"]);

	await runPipeline(commentPayload());
	const links = await db().select().from(schema.workEntryAgentEntries).all();
	expect(links.map((l) => l.agentEntryId)).toEqual(["session-on-issue"]);
});

// --- manifest + setup flow ---

it("gates the manifest endpoint to instance admins and binds a state cookie", async () => {
	const ctx = await setup();
	const forbidden = await apiJson(
		"POST",
		"/api/v1/instance/github/app/manifest",
		{ owner: null },
		ctx.member,
	);
	expect(forbidden.status).toBe(403);

	const res = await apiJson(
		"POST",
		"/api/v1/instance/github/app/manifest",
		{ owner: "acme" },
		ctx.admin,
	);
	expect(res.status).toBe(200);
	const { action, manifest } = (await res.json()) as {
		action: string;
		manifest: string;
	};
	expect(action).toContain(
		"https://github.com/organizations/acme/settings/apps/new",
	);
	expect(action).toContain("state=");
	expect(res.headers.get("set-cookie")).toContain("spantail_gh_state=");

	const parsed = JSON.parse(manifest);
	expect(parsed.public).toBe(false);
	expect(parsed.hook_attributes.url).toBe(
		"https://example.com/api/github/webhook",
	);
	expect(parsed.redirect_url).toBe("https://example.com/api/github/setup");
	expect(parsed.default_permissions).toEqual({
		metadata: "read",
		issues: "write",
		pull_requests: "write",
	});
	expect(parsed.default_events).toEqual([
		"issue_comment",
		"issues",
		"pull_request",
		"pull_request_review",
	]);

	// Personal-account owner posts to the user-scoped endpoint.
	const personal = await apiJson(
		"POST",
		"/api/v1/instance/github/app/manifest",
		{ owner: null },
		ctx.admin,
	);
	const personalAction = ((await personal.json()) as { action: string }).action;
	expect(personalAction).toContain("https://github.com/settings/apps/new");
});

it("converts the manifest code and stores decryptable credentials", async () => {
	const ctx = await setup();
	const init = await apiJson(
		"POST",
		"/api/v1/instance/github/app/manifest",
		{ owner: null },
		ctx.admin,
	);
	const cookie = init.headers.get("set-cookie")?.split(";")[0];
	const state = new URL(
		((await init.json()) as { action: string }).action,
	).searchParams.get("state");

	const res = await appFetch(
		`/api/github/setup?code=onetime&state=${encodeURIComponent(state ?? "")}`,
		{ headers: { cookie: cookie ?? "" }, redirect: "manual" },
	);
	expect(res.status).toBe(302);
	expect(res.headers.get("location")).toBe(
		"https://github.com/apps/spantail-test/installations/new",
	);

	const config = await getGithubAppConfig(db());
	expect(config).toMatchObject({
		appId: 4242,
		slug: "spantail-test",
		ownerLogin: "acme",
		clientId: "Iv1.testclient",
	});
	expect(
		await decryptSecret(TEST_AUTH_SECRET, config?.webhookSecretEnc ?? ""),
	).toBe(TEST_WEBHOOK_SECRET);
	// The stored key is PKCS#8: importable directly by WebCrypto.
	const der = await decryptSecret(
		TEST_AUTH_SECRET,
		config?.privateKeyEnc ?? "",
	);
	expect(der.length).toBeGreaterThan(0);
});

it("rejects setup callbacks without a matching state cookie", async () => {
	await setup();
	const res = await appFetch("/api/github/setup?code=x&state=forged", {
		redirect: "manual",
	});
	expect(res.status).toBe(302);
	expect(res.headers.get("location")).toContain("github_error=state");
	expect(await getGithubAppConfig(db())).toBeUndefined();
});

// --- connect flow ---

it("connects a GitHub identity via the App user-authorization flow", async () => {
	const ctx = await seedIntegration();
	// A second user linking the already-linked GitHub account must be refused.
	const other = await signUpUser("Other", "other@example.com");

	const start = await appFetch("/api/github/connect", {
		headers: { cookie: ctx.member },
		redirect: "manual",
	});
	expect(start.status).toBe(302);
	const authorize = new URL(start.headers.get("location") ?? "");
	expect(authorize.origin + authorize.pathname).toBe(
		"https://github.com/login/oauth/authorize",
	);
	expect(authorize.searchParams.get("client_id")).toBe("Iv1.testclient");
	const state = authorize.searchParams.get("state") ?? "";
	const stateCookie = start.headers.get("set-cookie")?.split(";")[0] ?? "";

	// The member relinks their own account: allowed (replaces the row).
	const callback = await appFetch(
		`/api/github/connect/callback?code=xyz&state=${encodeURIComponent(state)}`,
		{
			headers: { cookie: `${ctx.member}; ${stateCookie}` },
			redirect: "manual",
		},
	);
	expect(callback.status).toBe(302);
	expect(callback.headers.get("location")).toBe(
		"/settings/authentication?github=linked",
	);
	expect(await getGithubIdentityByUserId(db(), ctx.memberId)).toMatchObject({
		githubUserId: 777,
		login: "octocat",
	});

	// The other user tries to claim GitHub user 777 → already_linked.
	const otherStart = await appFetch("/api/github/connect", {
		headers: { cookie: other },
		redirect: "manual",
	});
	const otherState =
		new URL(otherStart.headers.get("location") ?? "").searchParams.get(
			"state",
		) ?? "";
	const otherCookie = otherStart.headers.get("set-cookie")?.split(";")[0] ?? "";
	const otherCallback = await appFetch(
		`/api/github/connect/callback?code=abc&state=${encodeURIComponent(otherState)}`,
		{ headers: { cookie: `${other}; ${otherCookie}` }, redirect: "manual" },
	);
	expect(otherCallback.headers.get("location")).toBe(
		"/settings/authentication?github=already_linked",
	);
});

it("redirects anonymous connect attempts to the login screen", async () => {
	await seedIntegration();
	const res = await appFetch("/api/github/connect", { redirect: "manual" });
	expect(res.status).toBe(302);
	expect(res.headers.get("location")).toBe("/login");
});

// --- instance admin management ---

it("reports app status and installations to admins only", async () => {
	const ctx = await seedIntegration();
	expect((await apiGet("/api/v1/instance/github", ctx.member)).status).toBe(
		403,
	);
	const res = await apiGet("/api/v1/instance/github", ctx.admin);
	const status = (await res.json()) as {
		app: { slug: string } | null;
		installations: unknown[];
	};
	expect(status.app?.slug).toBe("spantail-test");
	expect(status.installations).toHaveLength(1);

	// Any signed-in user may read the boolean gate.
	const enabled = await apiGet("/api/v1/instance/github/enabled", ctx.member);
	expect(await enabled.json()).toEqual({ enabled: true });
});

it("lists installation repos live with mapping status", async () => {
	const ctx = await seedIntegration();
	const res = await apiGet(
		"/api/v1/instance/github/installations/555/repos",
		ctx.admin,
	);
	expect(res.status).toBe(200);
	const { repos } = (await res.json()) as {
		repos: { fullName: string; mapped: boolean }[];
	};
	expect(repos).toEqual([
		{ repoId: 1010, fullName: "acme/spantail", private: true, mapped: true },
		{ repoId: 1011, fullName: "acme/other", private: false, mapped: false },
	]);
});

it("removes the app config but keeps mappings on delete", async () => {
	const ctx = await seedIntegration();
	const res = await apiJson(
		"DELETE",
		"/api/v1/instance/github/app",
		undefined,
		ctx.admin,
	);
	expect(res.status).toBe(204);
	expect(await getGithubAppConfig(db())).toBeUndefined();
	expect(await listGithubInstallations(db())).toHaveLength(0);
	const mappings = await db().select().from(schema.githubRepoMappings).all();
	expect(mappings).toHaveLength(1);
});
