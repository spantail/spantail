import { isSelfJoinDomain } from "@spantail/core";
import {
	authOptions,
	countUsers,
	type Database,
	getInstanceSettings,
	getPendingInvitationByEmail,
	getUserById,
	markInvitationAccepted,
	schema,
	updateUser,
} from "@spantail/db";
import type { CatalogLocale } from "@spantail/templates";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { renderPasswordResetEmail } from "./emails/password-reset-email";
import { appBaseUrl } from "./lib/app-base-url";
import { getMailer } from "./lib/mail/mailer";
import { seedStarterTemplates } from "./lib/starter-templates";

/**
 * Minimum length for the session-signing secret. `openssl rand -base64 32`
 * yields a 44-char string; 32 is a comfortable floor that still rejects the
 * obviously-too-weak values (empty, a stray word) without forcing a re-roll of
 * a slightly shorter but still-random secret.
 */
const MIN_AUTH_SECRET_LENGTH = 32;

/**
 * Fail closed on a missing or weak session-signing secret. Spantail is operated
 * by self-hosters who are not security specialists, so "forgot to set the
 * secret" is a realistic deployment state — and an empty/short secret signs
 * sessions with a forgeable value, compromising every account. Refuse to serve
 * instead of degrading silently. The secret value itself is never echoed.
 */
export function assertAuthSecret(secret: string | undefined): string {
	const trimmed = secret?.trim() ?? "";
	if (trimmed.length < MIN_AUTH_SECRET_LENGTH) {
		throw new Error(
			`BETTER_AUTH_SECRET is missing or too weak: set it to a random value of at least ${MIN_AUTH_SECRET_LENGTH} characters. Generate one with: openssl rand -base64 32`,
		);
	}
	// Return the trimmed value: validating the trimmed length but signing with
	// the raw value would let stray whitespace into the effective secret, making
	// it surprising and hard to reproduce.
	return trimmed;
}

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
 * Drizzle handle. Options shared with schema generation live in @spantail/db.
 *
 * `ctx` is the request's execution context; when present, reset-email delivery
 * is deferred via `waitUntil` so the response time of a recovery request does
 * not depend on whether the account exists (timing-based enumeration).
 *
 * `social` enables Google/GitHub providers for this request. Session-only
 * callers (e.g. `getSession`) can omit it.
 *
 * `locale` is the request's language, used only for the one-time starter-
 * template seeding when the first user (the instance admin) signs up. Only the
 * public sign-up handler passes a real value; callers that can never create the
 * first user (session validation, admin/invite account creation) may omit it.
 */
export function createAuth(
	env: Env,
	db: Database,
	// Structurally typed so both the Workers and Hono ExecutionContext fit.
	ctx?: { waitUntil(promise: Promise<unknown>): void },
	social?: SocialConfig,
	locale: CatalogLocale = "en",
) {
	// Fail closed before constructing the auth instance: a missing or weak
	// session secret must stop the request, not silently sign forgeable sessions.
	const secret = assertAuthSecret(env.BETTER_AUTH_SECRET);

	// Avatar URL supplied by the OAuth provider for this request, captured by the
	// provider profile mapping below. It is read once, when the session is
	// created, to backfill a user who has no avatar yet. `createAuth` runs once
	// per request, so this holder never leaks across requests.
	let capturedAvatarUrl: string | null = null;

	const socialProviders: NonNullable<
		Parameters<typeof betterAuth>[0]["socialProviders"]
	> = {};
	if (social?.google) {
		socialProviders.google = {
			clientId: social.google.clientId,
			clientSecret: social.google.clientSecret,
			// Capture the provider avatar so a user with none yet can be backfilled
			// (see session.create.before). Returns {} so Better Auth's default
			// profile mapping — name, email, image — is left untouched.
			mapProfileToUser: (profile) => {
				if (typeof profile.picture === "string") {
					capturedAvatarUrl = profile.picture;
				}
				return {};
			},
		};
	}
	if (social?.github) {
		socialProviders.github = {
			clientId: social.github.clientId,
			clientSecret: social.github.clientSecret,
			// GitHub only marks an email verified after the user proves ownership,
			// so we trust its verified flag exactly like Google's: a verified GitHub
			// email links into an existing (verified) account, while an unverified
			// one still cannot (requireLocalEmailVerified stays at its true default).
			mapProfileToUser: (profile) => {
				if (typeof profile.avatar_url === "string") {
					capturedAvatarUrl = profile.avatar_url;
				}
				return {};
			},
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
			sendResetPassword: async ({ user, token }, request) => {
				const deliver = async () => {
					try {
						const settings = await getInstanceSettings(db);
						if (!settings?.emailEnabled) return;
						const resetUrl = `${appBaseUrl(env, request)}/reset-password/${token}`;
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
		// Optional: pin a canonical origin for links and OAuth callbacks. When
		// unset, Better Auth infers the origin from each incoming request, which
		// is the zero-config path for a fresh *.workers.dev deploy.
		baseURL: env.BETTER_AUTH_URL?.trim() || undefined,
		secret,
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
							// Seed the starter catalog in the admin's language as part of the
							// same bootstrap. A failure here aborts the sign-up (the user row
							// is not yet committed and countUsers stays 0), so the bootstrap
							// stays retryable; the seed is idempotent, so a retry is a no-op
							// for rows that already landed.
							await seedStarterTemplates(db, locale);
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
							// Only a provider-verified email may consume an invitation: an
							// unverified email (e.g. a GitHub address the user has not
							// confirmed) is no proof they own the invited address, so it must
							// not claim the invite or any grant it carries.
							const invited =
								!selfJoin &&
								user.emailVerified === true &&
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
						// invitation in the route, so skip non-social creations here. Only a
						// provider-verified email may claim the invite and any grant it
						// carries (mirrors the before-hook admission check).
						if (!socialProviderOf(hookCtx)) return;
						if (!user.emailVerified) return;
						const invitation = await getPendingInvitationByEmail(
							db,
							user.email,
						);
						if (!invitation) return;
						await markInvitationAccepted(db, invitation.id);
						const grants = {
							...(invitation.grantAdmin ? { isAdmin: true } : {}),
							...(invitation.grantCanManageTemplates
								? { canManageTemplates: true }
								: {}),
						};
						if (Object.keys(grants).length > 0) {
							await updateUser(db, user.id, grants);
						}
					},
				},
			},
			session: {
				create: {
					// Block sign-in for disabled accounts at the single chokepoint every
					// sign-in method (password and social) passes through. Mirrors the
					// approach Better Auth's own admin plugin uses for banned users.
					before: async (session) => {
						const account = await getUserById(db, session.userId);
						if (account?.disabled) {
							throw new APIError("FORBIDDEN", {
								message: "This account is disabled; contact an instance admin",
							});
						}
						// Backfill the avatar from the OAuth provider when the user has none
						// yet. This chokepoint covers both social sign-up and sign-in
						// (createSession runs for the new-user and the existing/link
						// branches alike). capturedAvatarUrl is null for a password sign-in,
						// and an existing image (an uploaded token or an already-stored
						// provider URL) is never overwritten.
						if (account) {
							const image = backfillAvatarUrl(account.image, capturedAvatarUrl);
							if (image) {
								await updateUser(db, session.userId, { image });
							}
						}
					},
				},
			},
		},
	});
}

/**
 * The avatar URL to backfill onto a user during sign-in, or null to leave the
 * avatar untouched. Only a user with no avatar is filled: an existing image — a
 * locally uploaded token or an already-stored provider URL — is never
 * overwritten, and a non-social sign-in (no captured provider URL) is a no-op.
 */
export function backfillAvatarUrl(
	currentImage: string | null | undefined,
	providerAvatarUrl: string | null,
): string | null {
	if (currentImage) return null;
	return providerAvatarUrl ?? null;
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
