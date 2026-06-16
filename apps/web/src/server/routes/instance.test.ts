import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

type EmailSettings = {
	emailEnabled: boolean;
	emailFromAddress: string | null;
	emailFromName: string | null;
};

it("reads and updates email settings (instance admin only)", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");

	// Default: disabled.
	const initial = (await (
		await apiGet("/api/v1/instance/email", admin)
	).json()) as EmailSettings;
	expect(initial.emailEnabled).toBe(false);
	expect(initial.emailFromAddress).toBeNull();

	// Enable with a from address.
	const updated = await apiJson(
		"PATCH",
		"/api/v1/instance/email",
		{ emailEnabled: true, emailFromAddress: "noreply@example.com" },
		admin,
	);
	expect(updated.status).toBe(200);
	const body = (await updated.json()) as EmailSettings;
	expect(body.emailEnabled).toBe(true);
	expect(body.emailFromAddress).toBe("noreply@example.com");

	// Omitting from* keeps the existing value.
	const toggled = (await (
		await apiJson(
			"PATCH",
			"/api/v1/instance/email",
			{ emailEnabled: false },
			admin,
		)
	).json()) as EmailSettings;
	expect(toggled.emailEnabled).toBe(false);
	expect(toggled.emailFromAddress).toBe("noreply@example.com");

	// Non-admin is forbidden.
	const member = await signUpUser("Member", "member@example.com");
	expect((await apiGet("/api/v1/instance/email", member)).status).toBe(403);
});

it("requires a from address to enable email", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const res = await apiJson(
		"PATCH",
		"/api/v1/instance/email",
		{ emailEnabled: true },
		admin,
	);
	expect(res.status).toBe(400);
});
