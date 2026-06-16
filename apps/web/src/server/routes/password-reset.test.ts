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

/** Pulls the most recent reset token out of the dev outbox. */
function lastResetToken(): string {
	const latest = getOutbox()[0];
	if (!latest) throw new Error("no email captured");
	const match = latest.html.match(/\/reset-password\/([A-Za-z0-9_-]+)/);
	if (!match?.[1]) throw new Error("no reset link in email");
	return match[1];
}

it("exposes email-enabled publicly (unauthenticated)", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");

	// Default: off, readable without a session.
	const off = await apiGet("/api/v1/instance/email-enabled");
	expect(off.status).toBe(200);
	expect(await off.json()).toEqual({ enabled: false });

	await enableEmail(admin);
	const on = await apiGet("/api/v1/instance/email-enabled");
	expect(await on.json()).toEqual({ enabled: true });
});

it("sends nothing when email delivery is disabled", async () => {
	await signUpUser("Admin", "admin@example.com");

	const res = await apiJson(
		"POST",
		"/api/auth/request-password-reset",
		{ email: "admin@example.com" },
		undefined,
	);
	// Better Auth returns success regardless (no account enumeration), but with
	// delivery off we must not have sent anything.
	expect(res.status).toBe(200);
	expect(getOutbox()).toHaveLength(0);
});

it("emails a reset link that lets the user set a new password", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	await enableEmail(admin);

	const requested = await apiJson(
		"POST",
		"/api/auth/request-password-reset",
		{ email: "admin@example.com" },
		undefined,
	);
	expect(requested.status).toBe(200);
	expect(getOutbox()).toHaveLength(1);

	const token = lastResetToken();
	const reset = await apiJson(
		"POST",
		"/api/auth/reset-password",
		{ newPassword: "brandnewpass123", token },
		undefined,
	);
	expect(reset.status).toBe(200);

	// The old password no longer works; the new one does.
	const oldSignIn = await apiJson(
		"POST",
		"/api/auth/sign-in/email",
		{ email: "admin@example.com", password: "password1234" },
		undefined,
	);
	expect(oldSignIn.status).not.toBe(200);

	const newSignIn = await apiJson(
		"POST",
		"/api/auth/sign-in/email",
		{ email: "admin@example.com", password: "brandnewpass123" },
		undefined,
	);
	expect(newSignIn.status).toBe(200);
});
