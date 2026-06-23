import { z } from "zod";

/** Instance-wide email delivery settings (Cloudflare Email Service). */
export const emailSettingsSchema = z.object({
	emailEnabled: z.boolean(),
	emailFromAddress: z.email().nullable(),
	emailFromName: z.string().max(100).nullable(),
});
export type EmailSettings = z.infer<typeof emailSettingsSchema>;

/**
 * Public projection of whether the instance can deliver email. Exposed
 * unauthenticated so the forgot-password screen can decide between offering
 * self-service recovery and telling the user to contact an admin.
 */
export const emailEnabledSchema = z.object({
	enabled: z.boolean(),
});
export type EmailEnabled = z.infer<typeof emailEnabledSchema>;

export const updateEmailSettingsInputSchema = z.object({
	emailEnabled: z.boolean(),
	// Optional so callers can update one field at a time; the API requires a
	// from address to be present when enabling delivery.
	emailFromAddress: z.email().nullable().optional(),
	emailFromName: z.string().max(100).nullable().optional(),
});
export type UpdateEmailSettingsInput = z.infer<
	typeof updateEmailSettingsInputSchema
>;

/**
 * Projection of whether the instance has the AI agent activity feature on.
 * Read by any authenticated client to gate the agents UI; written by an
 * instance admin. Off by default because it can grow data volume.
 */
export const agentsEnabledSchema = z.object({
	enabled: z.boolean(),
});
export type AgentsEnabled = z.infer<typeof agentsEnabledSchema>;

export const updateAgentsEnabledInputSchema = z.object({
	agentsEnabled: z.boolean(),
});
export type UpdateAgentsEnabledInput = z.infer<
	typeof updateAgentsEnabledInputSchema
>;

/** Social login providers an instance admin can enable. */
export const oauthProviderSchema = z.enum(["google", "github"]);
export type OauthProvider = z.infer<typeof oauthProviderSchema>;

/** Per-provider state in the admin OAuth settings view. */
export const oauthProviderStatusSchema = z.object({
	enabled: z.boolean(),
	// Whether this deployment has the provider's client id + secret configured
	// in the environment. A provider cannot be enabled while unconfigured.
	configured: z.boolean(),
});
export type OauthProviderStatus = z.infer<typeof oauthProviderStatusSchema>;

/**
 * Admin-only projection of the instance's social login configuration. Secrets
 * never leave the environment; this only reports toggles, whether the runtime
 * has credentials, and the Google domain allowlist.
 */
export const oauthSettingsSchema = z.object({
	google: oauthProviderStatusSchema,
	github: oauthProviderStatusSchema,
	// Google Workspace domains whose users may self-join (auto-provision) via
	// Google sign-in without an invitation. Empty = no self-join: every member
	// must be invited. Out-of-domain Google users can still join by invitation.
	googleAllowedDomains: z.array(z.string()),
});
export type OauthSettings = z.infer<typeof oauthSettingsSchema>;

export const updateOauthSettingsInputSchema = z.object({
	googleOAuthEnabled: z.boolean().optional(),
	githubOAuthEnabled: z.boolean().optional(),
	googleAllowedDomains: z.array(z.string().max(253)).max(100).optional(),
});
export type UpdateOauthSettingsInput = z.infer<
	typeof updateOauthSettingsInputSchema
>;

/**
 * Public projection of which social login buttons the login screen should
 * offer. Exposed unauthenticated; a provider is "on" only when an admin enabled
 * it AND the runtime has its credentials.
 */
export const authProvidersSchema = z.object({
	google: z.boolean(),
	github: z.boolean(),
	// True only before the instance is claimed (no users yet). The login screen
	// shows the one-time sign-up form to bootstrap the first super-admin; once a
	// user exists, public sign-up is closed and the form is hidden.
	selfSignupAvailable: z.boolean(),
});
export type AuthProviders = z.infer<typeof authProvidersSchema>;

/**
 * Normalizes a raw domain allowlist for storage: lowercases, trims, strips a
 * leading "@", drops blanks, and de-duplicates while preserving order. The
 * admin UI accepts free-form text (newline/comma separated) so we tidy here.
 */
export function normalizeAllowedDomains(domains: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of domains) {
		const domain = raw.trim().toLowerCase().replace(/^@/, "");
		if (domain && !seen.has(domain)) {
			seen.add(domain);
			out.push(domain);
		}
	}
	return out;
}

/**
 * Whether an email's domain may self-join (auto-provision) via Google sign-in.
 * An empty list means no domain self-joins — every member must be invited.
 * Matching is exact on the part after "@" (case insensitive); subdomains are
 * not implicitly allowed.
 */
export function isSelfJoinDomain(
	email: string,
	allowedDomains: string[],
): boolean {
	if (allowedDomains.length === 0) return false;
	const domain = email.split("@").pop()?.toLowerCase();
	if (!domain) return false;
	return normalizeAllowedDomains(allowedDomains).includes(domain);
}
