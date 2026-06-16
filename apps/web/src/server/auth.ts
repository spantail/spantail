import {
	authOptions,
	countUsers,
	type Database,
	getInstanceSettings,
	schema,
} from "@toxil/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { renderPasswordResetEmail } from "./emails/password-reset-email";
import { getMailer } from "./lib/mail/mailer";

/**
 * Better Auth instance, created once per request with the request's D1-backed
 * Drizzle handle. Options shared with schema generation live in @toxil/db.
 */
export function createAuth(env: Env, db: Database) {
	return betterAuth({
		...authOptions,
		emailAndPassword: {
			...authOptions.emailAndPassword,
			// Self-service password recovery. Gated by the instance email toggle:
			// when delivery is off, the forgot-password screen tells the user to
			// contact an admin instead, and we send nothing here. Errors are
			// swallowed so the response never reveals whether an account exists or
			// that delivery failed.
			sendResetPassword: async ({ user, token }) => {
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
			},
		},
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, { provider: "sqlite", schema }),
		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
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
