import { env } from "cloudflare:workers";
import { createDb, findUserByEmail, schema } from "@toxil/db";
import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

type ManagedUser = {
	id: string;
	email: string;
	isAdmin: boolean;
	providers: string[];
	generatedPassword?: string;
};

it("lists, creates, and grants admin (instance admin only)", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");

	// Non-admins (and unauthenticated callers) cannot list users.
	expect((await apiGet("/api/v1/users")).status).toBe(401);

	const created = await apiJson(
		"POST",
		"/api/v1/users",
		{ email: "bob@example.com", name: "Bob", grantAdmin: false },
		admin,
	);
	expect(created.status).toBe(201);
	const bob = (await created.json()) as ManagedUser;
	expect(bob.isAdmin).toBe(false);
	// The generated password is returned exactly once for out-of-band delivery.
	expect(bob.generatedPassword).toBeTruthy();
	// Admin-created accounts are vouched and marked email-verified, so the user
	// can later link a Google account.
	const bobRow = await findUserByEmail(createDb(env.DB), "bob@example.com");
	expect(bobRow?.emailVerified).toBe(true);

	// Duplicate email is rejected.
	const dup = await apiJson(
		"POST",
		"/api/v1/users",
		{ email: "bob@example.com", name: "Bob 2" },
		admin,
	);
	expect(dup.status).toBe(409);

	// Created admin via grantAdmin.
	const adminCreated = await apiJson(
		"POST",
		"/api/v1/users",
		{ email: "carol@example.com", name: "Carol", grantAdmin: true },
		admin,
	);
	expect(adminCreated.status).toBe(201);
	expect(((await adminCreated.json()) as ManagedUser).isAdmin).toBe(true);

	const list = (await (
		await apiGet("/api/v1/users", admin)
	).json()) as ManagedUser[];
	expect(list).toHaveLength(3);
	// Password-only accounts report no linked social providers.
	expect(list.every((u) => Array.isArray(u.providers))).toBe(true);
	expect(list.find((u) => u.email === "bob@example.com")?.providers).toEqual(
		[],
	);

	// A non-admin cannot manage users.
	const eveCookie = await signUpUser("Eve", "eve@example.com");
	expect((await apiGet("/api/v1/users", eveCookie)).status).toBe(403);
});

it("deletes a user who authored a report template", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "UTC" },
			admin,
		)
	).json()) as { id: string };

	// A workspace admin authors a custom template, then is deleted instance-wide.
	const tina = await signUpUser("Tina", "tina@example.com");
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "tina@example.com", role: "admin" },
		admin,
	);
	const template = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/report-templates`,
		{ name: "Tina template", body: "# {{ report.name }}" },
		tina,
	);
	expect(template.status).toBe(201);

	const users = (await (await apiGet("/api/v1/users", admin)).json()) as {
		id: string;
		email: string;
	}[];
	const tinaId = users.find((u) => u.email === "tina@example.com")?.id ?? "";

	// created_by is set null on delete, so this must not fail the FK (no 500).
	const del = await apiJson(
		"DELETE",
		`/api/v1/users/${tinaId}`,
		undefined,
		admin,
	);
	expect(del.status).toBe(204);

	// The workspace template survives, just without an author.
	const list = (await (
		await apiGet(`/api/v1/workspaces/${ws.id}/report-templates`, admin)
	).json()) as { name: string }[];
	expect(list.some((t) => t.name === "Tina template")).toBe(true);
});

it("refuses to delete a workspace owner", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");

	// A second instance admin who creates (and thus owns) their own workspace.
	const owner = (await (
		await apiJson(
			"POST",
			"/api/v1/users",
			{ email: "owner2@example.com", name: "Owner2", grantAdmin: true },
			admin,
		)
	).json()) as { id: string; generatedPassword: string };
	const signIn = await apiJson(
		"POST",
		"/api/auth/sign-in/email",
		{ email: "owner2@example.com", password: owner.generatedPassword },
		undefined,
	);
	const ownerCookie = signIn.headers.get("set-cookie")?.split(";")[0] ?? "";
	const ws = await apiJson(
		"POST",
		"/api/v1/workspaces",
		{ slug: "beta", name: "Beta", timezone: "UTC" },
		ownerCookie,
	);
	expect(ws.status).toBe(201);

	// Deleting the owner would orphan the workspace, so it is refused.
	const del = await apiJson(
		"DELETE",
		`/api/v1/users/${owner.id}`,
		undefined,
		admin,
	);
	expect(del.status).toBe(409);
});

it("rejects direct user creation when email delivery is enabled", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	await apiJson(
		"PATCH",
		"/api/v1/instance/email",
		{ emailEnabled: true, emailFromAddress: "noreply@example.com" },
		admin,
	);
	const res = await apiJson(
		"POST",
		"/api/v1/users",
		{ email: "x@example.com", name: "X" },
		admin,
	);
	expect(res.status).toBe(403);
});

it("enforces last-admin and self guards", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const adminMe = (await (await apiGet("/api/v1/me", admin)).json()) as {
		user: { id: string };
	};

	// Cannot demote yourself.
	const selfDemote = await apiJson(
		"PATCH",
		`/api/v1/users/${adminMe.user.id}`,
		{ isAdmin: false },
		admin,
	);
	expect(selfDemote.status).toBe(403);

	// Cannot delete yourself.
	const selfDelete = await apiJson(
		"DELETE",
		`/api/v1/users/${adminMe.user.id}`,
		undefined,
		admin,
	);
	expect(selfDelete.status).toBe(403);

	// Promote a second user, then the first admin can be demoted (two admins).
	const second = (await (
		await apiJson(
			"POST",
			"/api/v1/users",
			{ email: "dave@example.com", name: "Dave", grantAdmin: true },
			admin,
		)
	).json()) as ManagedUser;

	// Simulate a linked Google account so the PATCH response must preserve it
	// (an admin editing a user must not blank out their linked providers).
	await createDb(env.DB).insert(schema.account).values({
		id: "acc-dave-google",
		accountId: "google-dave",
		providerId: "google",
		userId: second.id,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	const demoteOther = await apiJson(
		"PATCH",
		`/api/v1/users/${second.id}`,
		{ isAdmin: false },
		admin,
	);
	expect(demoteOther.status).toBe(200);
	const demoted = (await demoteOther.json()) as ManagedUser;
	expect(demoted.isAdmin).toBe(false);
	expect(demoted.providers).toEqual(["google"]);

	// Now only the actor is admin; deleting the other (non-admin) is fine.
	const del = await apiJson(
		"DELETE",
		`/api/v1/users/${second.id}`,
		undefined,
		admin,
	);
	expect(del.status).toBe(204);
});
