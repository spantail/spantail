import { env, exports } from "cloudflare:workers";
import { createDb, findUserByEmail } from "@toxil/db";
import { expect, it } from "vitest";

import { socialProviderOf } from "./auth";

const BASE = "https://example.com";

async function signUp(name: string, email: string) {
	return exports.default.fetch(
		new Request(`${BASE}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name, email, password: "password1234" }),
		}),
	);
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
