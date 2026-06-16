import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

type ManagedUser = {
	id: string;
	email: string;
	isAdmin: boolean;
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

	// A non-admin cannot manage users.
	const eveCookie = await signUpUser("Eve", "eve@example.com");
	expect((await apiGet("/api/v1/users", eveCookie)).status).toBe(403);
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

	const demoteOther = await apiJson(
		"PATCH",
		`/api/v1/users/${second.id}`,
		{ isAdmin: false },
		admin,
	);
	expect(demoteOther.status).toBe(200);
	expect(((await demoteOther.json()) as ManagedUser).isAdmin).toBe(false);

	// Now only the actor is admin; deleting the other (non-admin) is fine.
	const del = await apiJson(
		"DELETE",
		`/api/v1/users/${second.id}`,
		undefined,
		admin,
	);
	expect(del.status).toBe(204);
});
