import {
	getGithubAppConfig,
	getGithubIdentityByGithubUserId,
	upsertGithubAppConfig,
	upsertGithubIdentityForUser,
} from "@spantail/db";
import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import {
	convertManifest,
	exchangeOauthCode,
	getAuthenticatedUser,
} from "../lib/github/api";
import { clearInstallationTokenCache } from "../lib/github/app-auth";
import {
	decryptSecret,
	encryptSecret,
	type StatePurpose,
	signState,
	toBase64,
	verifyState,
} from "../lib/github/crypto";
import { privateKeyPemToPkcs8Der } from "../lib/github/pkcs8";
import { loadAuth, requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

/**
 * Browser-facing GitHub redirect flows (no JSON API here): the App Manifest
 * conversion callback and the per-user Connect GitHub authorization. Both are
 * CSRF-bound with a signed, purpose-scoped state that must round-trip through
 * GitHub's `state` param AND an HttpOnly cookie set on this origin — a
 * callback GET forged by a third party matches neither.
 */

export const STATE_COOKIE = "spantail_gh_state";
const STATE_TTL_MS = 10 * 60 * 1000;

export async function setStateCookie(
	c: Context<AppEnv>,
	secret: string,
	purpose: StatePurpose,
): Promise<string> {
	const state = await signState(secret, purpose, STATE_TTL_MS);
	setCookie(c, STATE_COOKIE, state, {
		path: "/api/github",
		httpOnly: true,
		// Follows the request scheme so the flows work in http local dev
		// (Safari rejects Secure cookies even on http://localhost).
		secure: new URL(c.req.url).protocol === "https:",
		sameSite: "Lax",
		maxAge: STATE_TTL_MS / 1000,
	});
	return state;
}

async function consumeStateCookie(
	c: Context<AppEnv>,
	secret: string,
	purpose: StatePurpose,
	stateParam: string | undefined,
): Promise<boolean> {
	const cookie = getCookie(c, STATE_COOKIE);
	deleteCookie(c, STATE_COOKIE, { path: "/api/github" });
	if (!cookie || !stateParam || cookie !== stateParam) return false;
	return verifyState(secret, cookie, purpose);
}

export const githubConnectRoutes = new Hono<AppEnv>()
	// GitHub redirects here after the admin approves the manifest; the one-time
	// `code` converts into the new App's credentials.
	.get("/setup", async (c) => {
		const ok = await consumeStateCookie(
			c,
			c.env.BETTER_AUTH_SECRET,
			"manifest",
			c.req.query("state"),
		);
		if (!ok) return c.redirect("/settings/github?github_error=state", 302);

		const code = c.req.query("code");
		if (!code) return c.redirect("/settings/github?github_error=code", 302);

		try {
			const conversion = await convertManifest(code);
			const pkcs8 = privateKeyPemToPkcs8Der(conversion.pem);
			if (!pkcs8) throw new Error("unsupported private key format");
			const secret = c.env.BETTER_AUTH_SECRET;
			await upsertGithubAppConfig(c.var.db, {
				appId: conversion.id,
				slug: conversion.slug,
				ownerLogin: conversion.owner.login,
				clientId: conversion.client_id,
				privateKeyEnc: await encryptSecret(secret, toBase64(pkcs8)),
				webhookSecretEnc: await encryptSecret(
					secret,
					conversion.webhook_secret,
				),
				clientSecretEnc: await encryptSecret(secret, conversion.client_secret),
			});
			// A re-registration invalidates tokens minted under the previous App.
			clearInstallationTokenCache();
			// Next step of onboarding: install the freshly created App somewhere.
			return c.redirect(
				`https://github.com/apps/${conversion.slug}/installations/new`,
				302,
			);
		} catch (error) {
			console.error("github manifest conversion failed", error);
			return c.redirect("/settings/github?github_error=conversion", 302);
		}
	})
	// Connect GitHub: sends the signed-in member to the App's user
	// authorization. No OAuth scopes are requested — the resulting token is
	// used once, to read the account identity.
	.get("/connect", loadAuth, async (c) => {
		const auth = c.var.auth;
		if (!auth || !("user" in auth) || auth.via !== "session") {
			return c.redirect("/login", 302);
		}
		const config = await getGithubAppConfig(c.var.db);
		if (!config) {
			return c.redirect("/settings/authentication?github=no_app", 302);
		}
		const state = await setStateCookie(c, c.env.BETTER_AUTH_SECRET, "connect");
		const origin = new URL(c.req.url).origin;
		const authorize = new URL("https://github.com/login/oauth/authorize");
		authorize.searchParams.set("client_id", config.clientId);
		authorize.searchParams.set(
			"redirect_uri",
			`${origin}/api/github/connect/callback`,
		);
		authorize.searchParams.set("state", state);
		return c.redirect(authorize.toString(), 302);
	})
	.get("/connect/callback", loadAuth, async (c) => {
		const auth = c.var.auth;
		if (!auth || !("user" in auth) || auth.via !== "session") {
			return c.redirect("/login", 302);
		}
		const ok = await consumeStateCookie(
			c,
			c.env.BETTER_AUTH_SECRET,
			"connect",
			c.req.query("state"),
		);
		if (!ok) {
			return c.redirect("/settings/authentication?github=state", 302);
		}
		const code = c.req.query("code");
		const config = await getGithubAppConfig(c.var.db);
		if (!code || !config) {
			return c.redirect("/settings/authentication?github=error", 302);
		}
		try {
			const clientSecret = await decryptSecret(
				c.env.BETTER_AUTH_SECRET,
				config.clientSecretEnc,
			);
			const token = await exchangeOauthCode(
				config.clientId,
				clientSecret,
				code,
			);
			const ghUser = await getAuthenticatedUser(token.access_token);

			const existing = await getGithubIdentityByGithubUserId(
				c.var.db,
				ghUser.id,
			);
			const { user } = requireAuth(c);
			if (existing && existing.userId !== user.id) {
				return c.redirect(
					"/settings/authentication?github=already_linked",
					302,
				);
			}
			await upsertGithubIdentityForUser(c.var.db, {
				githubUserId: ghUser.id,
				userId: user.id,
				login: ghUser.login,
			});
			return c.redirect("/settings/authentication?github=linked", 302);
		} catch (error) {
			console.error("github connect failed", error);
			return c.redirect("/settings/authentication?github=error", 302);
		}
	});
