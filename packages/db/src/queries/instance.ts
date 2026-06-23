import type { ReportTemplateOverrides } from "@toxil/core";
import { eq } from "drizzle-orm";

import type { Database } from "../index";
import { instanceSettings } from "../schema/instance";

export type InstanceSettingsRow = typeof instanceSettings.$inferSelect;

// One Toxil deployment has exactly one settings row.
const SINGLETON_ID = "singleton";

export async function getInstanceSettings(
	db: Database,
): Promise<InstanceSettingsRow | undefined> {
	return db
		.select()
		.from(instanceSettings)
		.where(eq(instanceSettings.id, SINGLETON_ID))
		.get();
}

export async function upsertInstanceSettings(
	db: Database,
	settings: {
		emailEnabled: boolean;
		emailFromAddress: string | null;
		emailFromName: string | null;
	},
): Promise<InstanceSettingsRow> {
	const rows = await db
		.insert(instanceSettings)
		.values({ id: SINGLETON_ID, ...settings })
		.onConflictDoUpdate({
			target: instanceSettings.id,
			set: { ...settings, updatedAt: new Date() },
		})
		.returning();
	const row = rows[0];
	if (!row) throw new Error("instance settings upsert returned no row");
	return row;
}

export async function upsertInstanceReportTemplateOverrides(
	db: Database,
	reportTemplateOverrides: ReportTemplateOverrides,
): Promise<InstanceSettingsRow> {
	// Touches only the report-template overrides column; other settings keep
	// their values (on insert they fall back to their schema defaults).
	const rows = await db
		.insert(instanceSettings)
		.values({ id: SINGLETON_ID, reportTemplateOverrides })
		.onConflictDoUpdate({
			target: instanceSettings.id,
			set: { reportTemplateOverrides, updatedAt: new Date() },
		})
		.returning();
	const row = rows[0];
	if (!row) throw new Error("instance settings upsert returned no row");
	return row;
}

export async function upsertInstanceAgentsEnabled(
	db: Database,
	agentsEnabled: boolean,
): Promise<InstanceSettingsRow> {
	// Touches only the agents toggle; other settings keep their values (on
	// insert they fall back to their schema defaults).
	const rows = await db
		.insert(instanceSettings)
		.values({ id: SINGLETON_ID, agentsEnabled })
		.onConflictDoUpdate({
			target: instanceSettings.id,
			set: { agentsEnabled, updatedAt: new Date() },
		})
		.returning();
	const row = rows[0];
	if (!row) throw new Error("instance settings upsert returned no row");
	return row;
}

export async function upsertInstanceOauthSettings(
	db: Database,
	settings: {
		googleOAuthEnabled: boolean;
		githubOAuthEnabled: boolean;
		googleAllowedDomains: string[];
	},
): Promise<InstanceSettingsRow> {
	// Touches only the OAuth columns; the email columns keep their values (on
	// insert they fall back to their schema defaults).
	const rows = await db
		.insert(instanceSettings)
		.values({ id: SINGLETON_ID, ...settings })
		.onConflictDoUpdate({
			target: instanceSettings.id,
			set: { ...settings, updatedAt: new Date() },
		})
		.returning();
	const row = rows[0];
	if (!row) throw new Error("instance settings upsert returned no row");
	return row;
}
