import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../index";
import { workEntryAgentEntries } from "../schema/agents";
import { workEntries } from "../schema/domain";
import {
	githubAppConfig,
	githubIdentities,
	githubInstallations,
	githubRepoMappings,
	workEntryGithubRefs,
} from "../schema/github";
import type { WorkEntryInsert, WorkEntryRow } from "./work-entries";

export type GithubAppConfigRow = typeof githubAppConfig.$inferSelect;
export type GithubInstallationRow = typeof githubInstallations.$inferSelect;
export type GithubRepoMappingRow = typeof githubRepoMappings.$inferSelect;
export type GithubIdentityRow = typeof githubIdentities.$inferSelect;
export type WorkEntryGithubRefRow = typeof workEntryGithubRefs.$inferSelect;

// One Spantail deployment owns exactly one BYO App.
const SINGLETON_ID = "singleton";

export async function getGithubAppConfig(
	db: Database,
): Promise<GithubAppConfigRow | undefined> {
	return db
		.select()
		.from(githubAppConfig)
		.where(eq(githubAppConfig.id, SINGLETON_ID))
		.get();
}

export async function upsertGithubAppConfig(
	db: Database,
	values: Omit<
		typeof githubAppConfig.$inferInsert,
		"id" | "createdAt" | "updatedAt"
	>,
): Promise<GithubAppConfigRow> {
	const rows = await db
		.insert(githubAppConfig)
		.values({ id: SINGLETON_ID, ...values })
		.onConflictDoUpdate({
			target: githubAppConfig.id,
			set: { ...values, updatedAt: new Date() },
		})
		.returning();
	const row = rows[0];
	if (!row) throw new Error("github app config upsert returned no row");
	return row;
}

/**
 * Removes the App registration and its installations. Mappings survive on
 * purpose: without the App they keep UC2 working in degraded mode.
 */
export async function deleteGithubAppConfig(db: Database): Promise<void> {
	await db.batch([
		db.delete(githubAppConfig).where(eq(githubAppConfig.id, SINGLETON_ID)),
		db.delete(githubInstallations),
	]);
}

export async function upsertGithubInstallation(
	db: Database,
	values: {
		installationId: number;
		accountLogin: string;
		accountType: "User" | "Organization";
	},
): Promise<GithubInstallationRow> {
	const rows = await db
		.insert(githubInstallations)
		.values({ id: crypto.randomUUID(), ...values, suspendedAt: null })
		.onConflictDoUpdate({
			target: githubInstallations.installationId,
			set: {
				accountLogin: values.accountLogin,
				accountType: values.accountType,
				suspendedAt: null,
			},
		})
		.returning();
	const row = rows[0];
	if (!row) throw new Error("github installation upsert returned no row");
	return row;
}

export async function setGithubInstallationSuspended(
	db: Database,
	installationId: number,
	suspendedAt: Date | null,
): Promise<void> {
	await db
		.update(githubInstallations)
		.set({ suspendedAt })
		.where(eq(githubInstallations.installationId, installationId));
}

export async function deleteGithubInstallation(
	db: Database,
	installationId: number,
): Promise<void> {
	await db
		.delete(githubInstallations)
		.where(eq(githubInstallations.installationId, installationId));
}

export async function listGithubInstallations(
	db: Database,
): Promise<GithubInstallationRow[]> {
	return db
		.select()
		.from(githubInstallations)
		.orderBy(githubInstallations.accountLogin)
		.all();
}

export async function getGithubInstallation(
	db: Database,
	installationId: number,
): Promise<GithubInstallationRow | undefined> {
	return db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.installationId, installationId))
		.get();
}

export async function createGithubRepoMapping(
	db: Database,
	values: Omit<typeof githubRepoMappings.$inferInsert, "id" | "createdAt">,
): Promise<GithubRepoMappingRow> {
	const rows = await db
		.insert(githubRepoMappings)
		.values({ id: crypto.randomUUID(), ...values })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("github repo mapping insert returned no row");
	return row;
}

export async function listGithubRepoMappingsByWorkspace(
	db: Database,
	workspaceId: string,
): Promise<GithubRepoMappingRow[]> {
	return db
		.select()
		.from(githubRepoMappings)
		.where(eq(githubRepoMappings.workspaceId, workspaceId))
		.orderBy(githubRepoMappings.repoFullName)
		.all();
}

export async function listAllGithubRepoMappings(
	db: Database,
): Promise<GithubRepoMappingRow[]> {
	return db
		.select()
		.from(githubRepoMappings)
		.orderBy(githubRepoMappings.repoFullName)
		.all();
}

export async function getGithubRepoMapping(
	db: Database,
	id: string,
): Promise<GithubRepoMappingRow | undefined> {
	return db
		.select()
		.from(githubRepoMappings)
		.where(eq(githubRepoMappings.id, id))
		.get();
}

export async function deleteGithubRepoMapping(
	db: Database,
	id: string,
): Promise<boolean> {
	const rows = await db
		.delete(githubRepoMappings)
		.where(eq(githubRepoMappings.id, id))
		.returning({ id: githubRepoMappings.id });
	return rows.length > 0;
}

export async function getGithubRepoMappingByFullName(
	db: Database,
	fullName: string,
): Promise<GithubRepoMappingRow | undefined> {
	return db
		.select()
		.from(githubRepoMappings)
		.where(eq(githubRepoMappings.repoFullName, fullName.toLowerCase()))
		.get();
}

/**
 * Resolves a webhook repository to its mapping: numeric repo id first (it
 * survives renames), then the full name. When the id matched but the cached
 * full name drifted (rename/transfer), the row self-heals so full-name
 * lookups (UC2, totals) keep working.
 */
export async function getGithubRepoMappingForRepo(
	db: Database,
	repo: { repoId: number; fullName: string },
): Promise<GithubRepoMappingRow | undefined> {
	const fullName = repo.fullName.toLowerCase();
	const byId = await db
		.select()
		.from(githubRepoMappings)
		.where(eq(githubRepoMappings.repoId, repo.repoId))
		.get();
	if (byId) {
		if (byId.repoFullName !== fullName) {
			const healed = await db
				.update(githubRepoMappings)
				.set({ repoFullName: fullName })
				.where(eq(githubRepoMappings.id, byId.id))
				.returning();
			return healed[0] ?? byId;
		}
		return byId;
	}
	const byName = await getGithubRepoMappingByFullName(db, fullName);
	// A name-matched row without a repo id was registered manually; adopt the
	// id so future renames resolve.
	if (byName && byName.repoId === null) {
		const adopted = await db
			.update(githubRepoMappings)
			.set({ repoId: repo.repoId })
			.where(eq(githubRepoMappings.id, byName.id))
			.returning();
		return adopted[0] ?? byName;
	}
	return byName;
}

export async function getGithubIdentityByGithubUserId(
	db: Database,
	githubUserId: number,
): Promise<GithubIdentityRow | undefined> {
	return db
		.select()
		.from(githubIdentities)
		.where(eq(githubIdentities.githubUserId, githubUserId))
		.get();
}

export async function getGithubIdentityByUserId(
	db: Database,
	userId: string,
): Promise<GithubIdentityRow | undefined> {
	return db
		.select()
		.from(githubIdentities)
		.where(eq(githubIdentities.userId, userId))
		.get();
}

/**
 * Links a GitHub account to a user, replacing the user's previous link (a
 * relink after a GitHub account change). Cross-user collisions are the
 * caller's pre-check; the unique index is the backstop.
 */
export async function upsertGithubIdentityForUser(
	db: Database,
	values: { githubUserId: number; userId: string; login: string },
): Promise<GithubIdentityRow> {
	const rows = await db.batch([
		db
			.delete(githubIdentities)
			.where(eq(githubIdentities.userId, values.userId)),
		db
			.insert(githubIdentities)
			.values({ id: crypto.randomUUID(), ...values })
			.returning(),
	]);
	const row = rows[1][0];
	if (!row) throw new Error("github identity insert returned no row");
	return row;
}

export async function deleteGithubIdentityByUserId(
	db: Database,
	userId: string,
): Promise<boolean> {
	const rows = await db
		.delete(githubIdentities)
		.where(eq(githubIdentities.userId, userId))
		.returning({ id: githubIdentities.id });
	return rows.length > 0;
}

/**
 * Inserts a work entry together with its (repo, issue#) ref in one db.batch,
 * so a duplicate comment id (webhook redelivery racing the pre-check) rolls
 * back the entry too — nothing half-written. Mirrors createWorkEntry's
 * pattern, plus optional agent-entry links.
 */
export async function createWorkEntryWithGithubRef(
	db: Database,
	values: WorkEntryInsert,
	ref: { repoFullName: string; issueNumber: number; commentId: number | null },
	agentEntryIds: string[] = [],
): Promise<WorkEntryRow> {
	const id = crypto.randomUUID();
	const insertEntry = db
		.insert(workEntries)
		.values({ id, ...values })
		.returning();
	const insertRef = db.insert(workEntryGithubRefs).values({
		workEntryId: id,
		repoFullName: ref.repoFullName.toLowerCase(),
		issueNumber: ref.issueNumber,
		commentId: ref.commentId,
	});
	const rows =
		agentEntryIds.length === 0
			? (await db.batch([insertEntry, insertRef]))[0]
			: (
					await db.batch([
						insertEntry,
						insertRef,
						db.insert(workEntryAgentEntries).values(
							agentEntryIds.map((agentEntryId) => ({
								workEntryId: id,
								agentEntryId,
							})),
						),
					])
				)[0];
	const row = rows[0];
	if (!row) throw new Error("work entry insert returned no row");
	return row;
}

export async function getWorkEntryGithubRefByCommentId(
	db: Database,
	commentId: number,
): Promise<WorkEntryGithubRefRow | undefined> {
	return db
		.select()
		.from(workEntryGithubRefs)
		.where(eq(workEntryGithubRefs.commentId, commentId))
		.get();
}

/** Total logged minutes across all work entries referencing (repo, issue#). */
export async function sumWorkEntryMinutesForGithubIssue(
	db: Database,
	repoFullName: string,
	issueNumber: number,
): Promise<number> {
	const row = await db
		.select({
			total: sql<number>`coalesce(sum(${workEntries.durationMinutes}), 0)`,
		})
		.from(workEntryGithubRefs)
		.innerJoin(workEntries, eq(workEntryGithubRefs.workEntryId, workEntries.id))
		.where(
			and(
				eq(workEntryGithubRefs.repoFullName, repoFullName.toLowerCase()),
				eq(workEntryGithubRefs.issueNumber, issueNumber),
			),
		)
		.get();
	return row?.total ?? 0;
}
