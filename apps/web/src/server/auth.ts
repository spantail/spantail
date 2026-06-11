import { authOptions, countUsers, type Database, schema } from "@toxil/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

/**
 * Better Auth instance, created once per request with the request's D1-backed
 * Drizzle handle. Options shared with schema generation live in @toxil/db.
 */
export function createAuth(env: Env, db: Database) {
	return betterAuth({
		...authOptions,
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
