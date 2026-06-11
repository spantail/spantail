import type { BetterAuthOptions } from "better-auth";

/**
 * Better Auth options shared between the Worker runtime (apps/web) and the
 * schema-generation CLI stub (scripts/auth-cli-config.ts). Keeping them in one
 * place prevents the generated schema from drifting from the runtime config.
 */
export const authOptions = {
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	user: {
		additionalFields: {
			// Instance admin: may create workspaces. Never settable by clients;
			// the first registered user becomes admin via a database hook.
			isAdmin: {
				type: "boolean",
				defaultValue: false,
				input: false,
			},
		},
	},
} satisfies BetterAuthOptions;
