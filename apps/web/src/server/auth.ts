import { isSelfJoinDomain } from "@toxil/core";
import {
	authOptions,
	countUsers,
	type Database,
	getInstanceSettings,
	getPendingInvitationByEmail,
	markInvitationAccepted,
	schema,
	updateUser,
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
			// GitHub email ownership is not something we treat as verified, so a
			// GitHub identity never gets the auto-link/trust a verified email does:
			// force emailVerified false (GitHub otherwise reports its own state).
			mapProfileToUser: () => ({ emailVerified: false }),
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
						// Bootstrap: the first registered user claims the instance as its
						// super-admin. Only the public email/password sign-up form reaches
						// here (social providers can't be enabled before an admin exists);
						// mark them verified so they can later link a Google account.
						if ((await countUsers(db)) === 0) {
							return {
								data: { ...user, isAdmin: true, emailVerified: true },
							};
						}
						// A social sign-in creating a brand-new account (not linking into
						// an existing one — that path skips user-create entirely). Admission
						// is invite-only except for an allowed-domain Google self-join.
						const provider = socialProviderOf(hookCtx);
						if (provider) {
							const selfJoin =
								provider === "google" &&
								Boolean(social?.google) &&
								isSelfJoinDomain(user.email, googleAllowedDomains);
							const invited =
								!selfJoin &&
								Boolean(await getPendingInvitationByEmail(db, user.email));
							if (!selfJoin && !invited) {
								throw new APIError("FORBIDDEN", {
									message:
										"This account is not allowed to sign in; ask an instance admin for an invitation",
								});
							}
						}
						// Credential creations only reach here via createAccount (invitation
						// accept or admin direct create); public sign-up is closed once a
						// user exists, so they are already vouched.
						return { data: user };
					},
					after: async (user, hookCtx) => {
						// A social sign-in may consume a standing invitation (Google/GitHub
						// onboarding). Credential invitation-accept consumes its own
						// invitation in the route, so skip non-social creations here.
						if (!socialProviderOf(hookCtx)) return;
						const invitation = await getPendingInvitationByEmail(
							db,
							user.email,
						);
						if (!invitation) return;
						await markInvitationAccepted(db, invitation.id);
						if (invitation.grantAdmin) {
							await updateUser(db, user.id, { isAdmin: true });
						}
					},
				},
			},
		},
	});
}

/**
 * The social provider behind a user-create hook, or null for a credential
 * sign-up. Better Auth drives social sign-in through two paths: the redirect
 * callback (`/callback/:id`) and the ID-token flow (`/sign-in/social`, which
 * never hits the callback).
 */
export function socialProviderOf(
	hookCtx:
		| {
				path?: string;
				params?: { id?: string };
				body?: { provider?: string };
		  }
		| null
		| undefined,
): "google" | "github" | null {
	const id =
		hookCtx?.path === "/callback/:id"
			? hookCtx.params?.id
			: hookCtx?.path === "/sign-in/social"
				? hookCtx.body?.provider
				: undefined;
	return id === "google" || id === "github" ? id : null;
}

export type Auth = ReturnType<typeof createAuth>;
