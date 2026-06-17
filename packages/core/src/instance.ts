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
	// Empty = any Google account may sign in. Otherwise a Google sign-in only
	// provisions an account when its email domain is in this list.
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
 * Whether an email may sign in given a Google domain allowlist. An empty list
 * means no restriction. Matching is exact on the part after "@" (case
 * insensitive); subdomains are not implicitly allowed.
 */
export function isEmailDomainAllowed(
	email: string,
	allowedDomains: string[],
): boolean {
	if (allowedDomains.length === 0) return true;
	const domain = email.split("@").pop()?.toLowerCase();
	if (!domain) return false;
	return normalizeAllowedDomains(allowedDomains).includes(domain);
}
