import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";
import { getOutbox } from "../lib/mail/mailer";

async function enableEmail(admin: string) {
	await apiJson(
		"PATCH",
		"/api/v1/instance/email",
		{ emailEnabled: true, emailFromAddress: "noreply@example.com" },
		admin,
	);
}

/** Pulls the most recent invitation token out of the dev outbox. */
function lastInviteToken(): string {
	const latest = getOutbox()[0];
	if (!latest) throw new Error("no email captured");
	const match = latest.html.match(/\/invite\/([A-Za-z0-9_-]+)/);
	if (!match?.[1]) throw new Error("no invite link in email");
	return match[1];
}

it("requires email delivery to be enabled to invite", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const off = await apiJson(
		"POST",
		"/api/v1/invitations",
		{ email: "newbie@example.com" },
		admin,
	);
	expect(off.status).toBe(403);
});

it("invites a user, who accepts and signs in", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	await enableEmail(admin);

	const invited = await apiJson(
		"POST",
		"/api/v1/invitations",
		{ email: "newbie@example.com", grantAdmin: true },
		admin,
	);
	expect(invited.status).toBe(201);

	const pending = (await (
		await apiGet("/api/v1/invitations", admin)
	).json()) as { email: string }[];
	expect(pending).toHaveLength(1);
	expect(pending[0]?.email).toBe("newbie@example.com");

	const token = lastInviteToken();

	// Public token check returns the invited email.
	const preview = await apiGet(`/api/v1/invitations/accept/${token}`);
	expect(preview.status).toBe(200);
	expect(((await preview.json()) as { email: string }).email).toBe(
		"newbie@example.com",
	);

	// Accept sets name + password and creates the account (granted admin).
	const accepted = await apiJson(
		"POST",
		`/api/v1/invitations/accept/${token}`,
		{ name: "Newbie", password: "newpassword123" },
		undefined,
	);
	expect(accepted.status).toBe(201);

	// The token is single-use now.
	const reused = await apiGet(`/api/v1/invitations/accept/${token}`);
	expect(reused.status).toBe(404);

	// The new user exists and is an admin (grantAdmin was set).
	const users = (await (await apiGet("/api/v1/users", admin)).json()) as {
		email: string;
		isAdmin: boolean;
	}[];
	const newbie = users.find((u) => u.email === "newbie@example.com");
	expect(newbie?.isAdmin).toBe(true);

	// The invitee can sign in with the password they chose.
	const signIn = await apiJson(
		"POST",
		"/api/auth/sign-in/email",
		{ email: "newbie@example.com", password: "newpassword123" },
		undefined,
	);
	expect(signIn.status).toBe(200);
});

it("rejects an invalid invitation token", async () => {
	await signUpUser("Admin", "admin@example.com");
	expect(
		(await apiGet("/api/v1/invitations/accept/not-a-real-token")).status,
	).toBe(404);
});
