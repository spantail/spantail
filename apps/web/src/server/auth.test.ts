import { env, exports } from "cloudflare:workers";
import { createDb, findUserByEmail } from "@spantail/db";
import { defaultTemplateForLocale } from "@spantail/templates";
import { expect, it } from "vitest";

import { socialProviderOf } from "./auth";

const BASE = "https://example.com";

async function signUp(name: string, email: string, acceptLanguage?: string) {
	return exports.default.fetch(
		new Request(`${BASE}/api/auth/sign-up/email`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
			},
			body: JSON.stringify({ name, email, password: "password1234" }),
		}),
	);
}

async function listTemplateNames(cookie: string): Promise<string[]> {
	const res = await exports.default.fetch(
		new Request(`${BASE}/api/v1/report-templates`, { headers: { cookie } }),
	);
	const list = (await res.json()) as Array<{ name: string }>;
	return list.map((t) => t.name);
}

function sessionCookie(res: Response): string {
	const setCookie = res.headers.get("set-cookie");
	if (!setCookie) throw new Error("expected a set-cookie header");
	const first = setCookie.split(";")[0];
	if (!first) throw new Error("malformed set-cookie header");
	return first;
}

it("signs up, signs in, and reports the session", async () => {
	const signUpRes = await signUp("Alice", "alice@example.com");
	expect(signUpRes.status).toBe(200);

	const sessionRes = await exports.default.fetch(
		new Request(`${BASE}/api/auth/get-session`, {
			headers: { cookie: sessionCookie(signUpRes) },
		}),
	);
	expect(sessionRes.status).toBe(200);
	const session = (await sessionRes.json()) as {
		user: { email: string; isAdmin: boolean };
	};
	expect(session.user.email).toBe("alice@example.com");

	const signInRes = await exports.default.fetch(
		new Request(`${BASE}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "alice@example.com",
				password: "password1234",
			}),
		}),
	);
	expect(signInRes.status).toBe(200);
});

it("makes the first user an instance admin and closes public sign-up", async () => {
	const firstRes = await signUp("First", "first@example.com");
	expect(firstRes.status).toBe(200);

	const firstSession = (await (
		await exports.default.fetch(
			new Request(`${BASE}/api/auth/get-session`, {
				headers: { cookie: sessionCookie(firstRes) },
			}),
		)
	).json()) as { user: { isAdmin: boolean } };
	expect(firstSession.user.isAdmin).toBe(true);

	// The bootstrap admin is marked email-verified so they can later link a
	// Google account to this credential account.
	const firstRow = await findUserByEmail(createDb(env.DB), "first@example.com");
	expect(firstRow?.emailVerified).toBe(true);

	// Onboarding becomes admin-driven once the bootstrap admin exists, so
	// public sign-up is rejected for everyone after the first user.
	const secondRes = await signUp("Second", "second@example.com");
	expect(secondRes.status).toBe(403);
});

it("seeds the bootstrap admin a default template in the Accept-Language locale", async () => {
	const res = await signUp("First", "first@example.com", "ja,en;q=0.8");
	expect(res.status).toBe(200);
	// Exactly one template is seeded for the first admin (builtins are gone),
	// in the negotiated locale.
	expect(await listTemplateNames(sessionCookie(res))).toEqual([
		defaultTemplateForLocale("ja").name,
	]);
});

it("seeds the English default template when no language is sent", async () => {
	const res = await signUp("First", "first@example.com");
	expect(res.status).toBe(200);
	expect(await listTemplateNames(sessionCookie(res))).toEqual([
		defaultTemplateForLocale("en").name,
	]);
});

it("detects the social provider behind a user-create hook", () => {
	expect(
		socialProviderOf({ path: "/callback/:id", params: { id: "google" } }),
	).toBe("google");
	expect(
		socialProviderOf({ path: "/callback/:id", params: { id: "github" } }),
	).toBe("github");
	expect(
		socialProviderOf({ path: "/sign-in/social", body: { provider: "google" } }),
	).toBe("google");
	// Credential sign-up and unknown providers are not social.
	expect(socialProviderOf({ path: "/sign-up/email" })).toBeNull();
	expect(
		socialProviderOf({ path: "/callback/:id", params: { id: "apple" } }),
	).toBeNull();
	expect(socialProviderOf(null)).toBeNull();
});
