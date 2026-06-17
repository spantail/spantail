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

type OauthSettings = {
	google: { enabled: boolean; configured: boolean };
	github: { enabled: boolean; configured: boolean };
	googleAllowedDomains: string[];
};

it("reads and updates OAuth settings (instance admin only)", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");

	// Default: both providers off. Google is configured (vitest binding) while
	// GitHub has no credentials.
	const initial = (await (
		await apiGet("/api/v1/instance/oauth", admin)
	).json()) as OauthSettings;
	expect(initial.google).toEqual({ enabled: false, configured: true });
	expect(initial.github).toEqual({ enabled: false, configured: false });
	expect(initial.googleAllowedDomains).toEqual([]);

	// Enable Google with a domain allowlist; domains are normalized on save.
	const updated = await apiJson(
		"PATCH",
		"/api/v1/instance/oauth",
		{
			googleOAuthEnabled: true,
			googleAllowedDomains: ["  Example.com ", "@Example.com", "foo.org"],
		},
		admin,
	);
	expect(updated.status).toBe(200);
	const body = (await updated.json()) as OauthSettings;
	expect(body.google.enabled).toBe(true);
	expect(body.googleAllowedDomains).toEqual(["example.com", "foo.org"]);

	// Omitting a toggle keeps its current value.
	const kept = (await (
		await apiJson(
			"PATCH",
			"/api/v1/instance/oauth",
			{ googleAllowedDomains: [] },
			admin,
		)
	).json()) as OauthSettings;
	expect(kept.google.enabled).toBe(true);
	expect(kept.googleAllowedDomains).toEqual([]);

	// Non-admin is forbidden.
	const member = await signUpUser("Member", "member@example.com");
	expect((await apiGet("/api/v1/instance/oauth", member)).status).toBe(403);
});

it("rejects enabling a provider without configured credentials", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const res = await apiJson(
		"PATCH",
		"/api/v1/instance/oauth",
		{ githubOAuthEnabled: true },
		admin,
	);
	expect(res.status).toBe(400);
});

it("exposes enabled providers publicly for the login screen", async () => {
	type AuthProviders = { google: boolean; github: boolean };

	// Anonymous, nothing enabled yet.
	const before = (await (
		await apiGet("/api/v1/instance/auth-providers")
	).json()) as AuthProviders;
	expect(before).toEqual({ google: false, github: false });

	// Enable Google, then it shows up for anonymous callers.
	const admin = await signUpUser("Admin", "admin@example.com");
	await apiJson(
		"PATCH",
		"/api/v1/instance/oauth",
		{ googleOAuthEnabled: true },
		admin,
	);
	const after = (await (
		await apiGet("/api/v1/instance/auth-providers")
	).json()) as AuthProviders;
	expect(after).toEqual({ google: true, github: false });
});
