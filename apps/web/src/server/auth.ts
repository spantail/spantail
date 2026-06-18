import { isEmailDomainAllowed } from "@toxil/core";
import {
	authOptions,
	countUsers,
	type Database,
	getInstanceSettings,
	schema,
} from "@toxil/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { renderPasswordResetEmail } from "./emails/password-reset-email";
import { getMailer } from "./lib/mail/mailer";

/**
 * Social login providers to enable for this request, resolved from the instance
 * settings (admin toggles) and environment credentials by the caller. A
 * provider absent here has no callback route, so it cannot be used to sign in.
 */
export interface SocialConfig {
	google?: { clientId: string; clientSecret: string; allowedDomains: string[] };
	github?: { clientId: string; clientSecret: string };
}

/**
 * Better Auth instance, created once per request with the request's D1-backed
 * Drizzle handle. Options shared with schema generation live in @toxil/db.
 *
 * `ctx` is the request's execution context; when present, reset-email delivery
 * is deferred via `waitUntil` so the response time of a recovery request does
 * not depend on whether the account exists (timing-based enumeration).
 *
 * `social` enables Google/GitHub providers for this request. Session-only
 * callers (e.g. `getSession`) can omit it.
 */
export function createAuth(
	env: Env,
	db: Database,
	// Structurally typed so both the Workers and Hono ExecutionContext fit.
	ctx?: { waitUntil(promise: Promise<unknown>): void },
	social?: SocialConfig,
) {
	const socialProviders: NonNullable<
		Parameters<typeof betterAuth>[0]["socialProviders"]
	> = {};
	if (social?.google) {
		socialProviders.google = {
			clientId: social.google.clientId,
			clientSecret: social.google.clientSecret,
		};
	}
	if (social?.github) {
		socialProviders.github = {
			clientId: social.github.clientId,
			clientSecret: social.github.clientSecret,
		};
	}
	const googleAllowedDomains = social?.google?.allowedDomains ?? [];

	return betterAuth({
		socialProviders,
		...authOptions,
		emailAndPassword: {
			...authOptions.emailAndPassword,
			// Recovery resets a credential that may be lost or compromised, so drop
			// every other active session rather than leaving them authenticated.
			revokeSessionsOnPasswordReset: true,
			// Self-service password recovery. Gated by the instance email toggle:
			// when delivery is off, the forgot-password screen tells the user to
			// contact an admin instead, and we send nothing here. Errors are
			// swallowed so the response never reveals whether an account exists or
			// that delivery failed.
			sendResetPassword: async ({ user, token }) => {
				const deliver = async () => {
					try {
						const settings = await getInstanceSettings(db);
						if (!settings?.emailEnabled) return;
						const resetUrl = `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/reset-password/${token}`;
						const { subject, html, text } =
							await renderPasswordResetEmail(resetUrl);
						const mailer = getMailer(env, {
							address: settings.emailFromAddress,
							name: settings.emailFromName,
						});
						await mailer.send({ to: user.email, subject, html, text });
					} catch {
						// Intentionally silent (see above).
					}
				};
				// Don't block the response on render/send: existing accounts would
				// otherwise answer measurably slower than unknown ones, leaking
				// which emails are registered.
				if (ctx) {
					ctx.waitUntil(deliver());
					return;
				}
				await deliver();
			},
		},
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, { provider: "sqlite", schema }),
		databaseHooks: {
			user: {
				create: {
					before: async (user, hookCtx) => {
						// Google domain allowlist: enforced when a Google sign-in would
						// auto-provision a new user, on both sign-in paths — the redirect
						// callback (/callback/:id) and the ID-token flow (/sign-in/social,
						// which never hits the callback). Existing users (created by an
						// admin) are already trusted and are not re-checked here.
						const isGoogleSignIn =
							(hookCtx?.path === "/callback/:id" &&
								hookCtx.params?.id === "google") ||
							(hookCtx?.path === "/sign-in/social" &&
								hookCtx.body?.provider === "google");
						if (
							social?.google &&
							isGoogleSignIn &&
							!isEmailDomainAllowed(user.email, googleAllowedDomains)
						) {
							throw new APIError("FORBIDDEN", {
								message: "This email domain is not allowed to sign in",
							});
						}
						// The first registered user becomes the instance admin.
						if ((await countUsers(db)) === 0) {
							return { data: { ...user, isAdmin: true } };
						}
						return { data: user };
					},
				},
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
