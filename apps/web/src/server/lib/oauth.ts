import type { OauthProvider } from "@toxil/core";
import { type Database, getInstanceSettings } from "@toxil/db";

import type { SocialConfig } from "../auth";

export interface OauthCredentials {
	clientId: string;
	clientSecret: string;
}

/**
 * Reads a provider's OAuth client credentials from the environment. Secrets are
 * deploy-time config (`wrangler secret` / `.dev.vars`), never stored in the
 * database. Returns null unless both the client id and secret are present.
 */
export function oauthCredentials(
	env: Env,
	provider: OauthProvider,
): OauthCredentials | null {
	const [clientId, clientSecret] =
		provider === "google"
			? [env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET]
			: [env.GITHUB_OAUTH_CLIENT_ID, env.GITHUB_OAUTH_CLIENT_SECRET];
	if (clientId && clientSecret) return { clientId, clientSecret };
	return null;
}

/** Whether the runtime has credentials for a provider (gates enabling it). */
export function oauthProviderConfigured(
	env: Env,
	provider: OauthProvider,
): boolean {
	return oauthCredentials(env, provider) !== null;
}

/**
 * Resolves the social providers to actually enable for this instance: a
 * provider is live only when an admin enabled it AND its credentials are
 * configured. Used both to build the Better Auth instance and to tell the login
 * screen which buttons to show.
 */
export async function resolveSocialConfig(
	env: Env,
	db: Database,
): Promise<SocialConfig> {
	const settings = await getInstanceSettings(db);
	const social: SocialConfig = {};
	if (settings?.googleOAuthEnabled) {
		const creds = oauthCredentials(env, "google");
		if (creds) {
			social.google = {
				...creds,
				allowedDomains: settings.googleAllowedDomains ?? [],
			};
		}
	}
	if (settings?.githubOAuthEnabled) {
		const creds = oauthCredentials(env, "github");
		if (creds) social.github = creds;
	}
	return social;
}
