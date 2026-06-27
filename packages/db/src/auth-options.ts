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
			// May manage instance-wide report templates without being a full
			// instance admin. Granted by an admin; never settable by clients.
			canManageTemplates: {
				type: "boolean",
				defaultValue: false,
				input: false,
			},
			// Disabled accounts cannot sign in; exposed on the session user so the
			// auth middleware can lock out an account mid-session. Never settable
			// by clients (toggled by an instance admin via the user-management API).
			disabled: {
				type: "boolean",
				defaultValue: false,
				input: false,
			},
			// The user's IANA timezone (null = UTC fallback). Client-settable from
			// account preferences (input: true), unlike the admin-only flags above.
			timezone: {
				type: "string",
				required: false,
				input: true,
			},
		},
	},
} satisfies BetterAuthOptions;
