import {
	type AgentsEnabled,
	type AuthProviders,
	type EmailEnabled,
	type EmailSettings,
	normalizeAllowedDomains,
	type OauthSettings,
	type RealtimeEnabled,
	updateAgentsEnabledInputSchema,
	updateEmailSettingsInputSchema,
	updateOauthSettingsInputSchema,
	updateRealtimeEnabledInputSchema,
} from "@spantail/core";
import {
	countUsers,
	getInstanceSettings,
	type InstanceSettingsRow,
	upsertInstanceAgentsEnabled,
	upsertInstanceOauthSettings,
	upsertInstanceRealtimeEnabled,
	upsertInstanceSettings,
} from "@spantail/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { oauthProviderConfigured, resolveSocialConfig } from "../lib/oauth";
import { requireInstanceAdmin } from "../lib/permissions";
import { checkForUpdate } from "../lib/update-check";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

function toEmailSettings(row: InstanceSettingsRow | undefined): EmailSettings {
	return {
		emailEnabled: row?.emailEnabled ?? false,
		emailFromAddress: row?.emailFromAddress ?? null,
		emailFromName: row?.emailFromName ?? null,
	};
}

function toOauthSettings(
	env: Env,
	row: InstanceSettingsRow | undefined,
): OauthSettings {
	return {
		google: {
			enabled: row?.googleOAuthEnabled ?? false,
			configured: oauthProviderConfigured(env, "google"),
		},
		github: {
			enabled: row?.githubOAuthEnabled ?? false,
			configured: oauthProviderConfigured(env, "github"),
		},
		googleAllowedDomains: row?.googleAllowedDomains ?? [],
	};
}

export const instanceRoutes = new Hono<AppEnv>()
	// Public: unauthenticated so the forgot-password screen can branch between
	// self-service recovery and a "contact your admin" message. Exposes only the
	// boolean, never the from address.
	.get("/email-enabled", async (c) => {
		const settings = await getInstanceSettings(c.var.db);
		return c.json({
			enabled: settings?.emailEnabled ?? false,
		} satisfies EmailEnabled);
	})
	.get("/email", async (c) => {
		requireInstanceAdmin(c);
		return c.json(toEmailSettings(await getInstanceSettings(c.var.db)));
	})
	.patch("/email", async (c) => {
		requireInstanceAdmin(c);
		const input = validate(updateEmailSettingsInputSchema, await c.req.json());

		// Omitted from* fields keep their current values.
		const current = toEmailSettings(await getInstanceSettings(c.var.db));
		const emailFromAddress =
			input.emailFromAddress === undefined
				? current.emailFromAddress
				: input.emailFromAddress;
		// Enabling without a sender would make every invite fail at send time, so
		// require a from address to turn delivery on.
		if (input.emailEnabled && !emailFromAddress) {
			throw new AppError(
				"bad_request",
				"A from address is required to enable email delivery",
			);
		}
		const row = await upsertInstanceSettings(c.var.db, {
			emailEnabled: input.emailEnabled,
			emailFromAddress,
			emailFromName:
				input.emailFromName === undefined
					? current.emailFromName
					: input.emailFromName,
		});
		return c.json(toEmailSettings(row));
	})
	// Whether the AI agent activity feature is on. Read by any caller to gate
	// the agents UI; reports only the boolean.
	.get("/agents-enabled", async (c) => {
		const settings = await getInstanceSettings(c.var.db);
		return c.json({
			enabled: settings?.agentsEnabled ?? false,
		} satisfies AgentsEnabled);
	})
	.patch("/agents", async (c) => {
		requireInstanceAdmin(c);
		const input = validate(updateAgentsEnabledInputSchema, await c.req.json());
		const row = await upsertInstanceAgentsEnabled(
			c.var.db,
			input.agentsEnabled,
		);
		return c.json({ enabled: row.agentsEnabled } satisfies AgentsEnabled);
	})
	// Whether realtime SSE updates are on. Read by any caller so the SPA can
	// decide whether to open the stream; reports only the boolean.
	.get("/realtime-enabled", async (c) => {
		const settings = await getInstanceSettings(c.var.db);
		return c.json({
			enabled: settings?.realtimeEnabled ?? false,
		} satisfies RealtimeEnabled);
	})
	.patch("/realtime", async (c) => {
		requireInstanceAdmin(c);
		const input = validate(
			updateRealtimeEnabledInputSchema,
			await c.req.json(),
		);
		const row = await upsertInstanceRealtimeEnabled(
			c.var.db,
			input.realtimeEnabled,
		);
		return c.json({ enabled: row.realtimeEnabled } satisfies RealtimeEnabled);
	})
	// The instance's version standing (running version + whether a newer upstream
	// release exists), surfaced on the System page. Any authenticated member —
	// not just admins — so more people notice when the instance is behind, but
	// requireAuth keeps the exact running version from leaking to anonymous
	// callers. Best-effort and cached.
	.get("/version", async (c) => {
		requireAuth(c);
		return c.json(await checkForUpdate(__APP_VERSION__));
	})
	// Public: tells the login screen which social buttons to show. A provider is
	// "on" only when an admin enabled it and its credentials are configured.
	.get("/auth-providers", async (c) => {
		const social = await resolveSocialConfig(c.env, c.var.db);
		return c.json({
			google: social.google !== undefined,
			github: social.github !== undefined,
			// Before the instance is claimed, the login screen offers a one-time
			// sign-up form to bootstrap the first super-admin.
			selfSignupAvailable: (await countUsers(c.var.db)) === 0,
		} satisfies AuthProviders);
	})
	.get("/oauth", async (c) => {
		requireInstanceAdmin(c);
		return c.json(toOauthSettings(c.env, await getInstanceSettings(c.var.db)));
	})
	.patch("/oauth", async (c) => {
		requireInstanceAdmin(c);
		const input = validate(updateOauthSettingsInputSchema, await c.req.json());

		// Omitted fields keep their current values.
		const current = await getInstanceSettings(c.var.db);
		const googleOAuthEnabled =
			input.googleOAuthEnabled ?? current?.googleOAuthEnabled ?? false;
		const githubOAuthEnabled =
			input.githubOAuthEnabled ?? current?.githubOAuthEnabled ?? false;

		// Enabling a provider without credentials would surface a broken button, so
		// reject it (mirrors the email "from address required to enable" rule).
		if (googleOAuthEnabled && !oauthProviderConfigured(c.env, "google")) {
			throw new AppError(
				"bad_request",
				"Google OAuth credentials are not configured on this instance",
			);
		}
		if (githubOAuthEnabled && !oauthProviderConfigured(c.env, "github")) {
			throw new AppError(
				"bad_request",
				"GitHub OAuth credentials are not configured on this instance",
			);
		}

		const row = await upsertInstanceOauthSettings(c.var.db, {
			googleOAuthEnabled,
			githubOAuthEnabled,
			googleAllowedDomains: normalizeAllowedDomains(
				input.googleAllowedDomains ?? current?.googleAllowedDomains ?? [],
			),
		});
		return c.json(toOauthSettings(c.env, row));
	});
