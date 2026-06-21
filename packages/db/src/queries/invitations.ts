import { and, eq, gt, isNull } from "drizzle-orm";

import type { Database } from "../index";
import { userInvitations } from "../schema/instance";

export type InvitationRow = typeof userInvitations.$inferSelect;

export async function createInvitation(
	db: Database,
	input: {
		email: string;
		tokenHash: string;
		invitedByUserId: string;
		grantAdmin: boolean;
		grantCanManageTemplates: boolean;
		expiresAt: Date;
	},
): Promise<InvitationRow> {
	const rows = await db
		.insert(userInvitations)
		.values({ id: crypto.randomUUID(), ...input })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("invitation insert returned no row");
	return row;
}

export async function getInvitationByTokenHash(
	db: Database,
	tokenHash: string,
): Promise<InvitationRow | undefined> {
	return db
		.select()
		.from(userInvitations)
		.where(eq(userInvitations.tokenHash, tokenHash))
		.get();
}

/** A still-open invitation for an email (not yet accepted). */
export async function getPendingInvitationByEmail(
	db: Database,
	email: string,
): Promise<InvitationRow | undefined> {
	return db
		.select()
		.from(userInvitations)
		.where(
			and(
				eq(userInvitations.email, email),
				isNull(userInvitations.acceptedAt),
				gt(userInvitations.expiresAt, new Date()),
			),
		)
		.get();
}

export async function listPendingInvitations(
	db: Database,
): Promise<InvitationRow[]> {
	// Expired invitations are no longer actionable, so they are not "pending".
	return db
		.select()
		.from(userInvitations)
		.where(
			and(
				isNull(userInvitations.acceptedAt),
				gt(userInvitations.expiresAt, new Date()),
			),
		)
		.orderBy(userInvitations.createdAt);
}

export async function markInvitationAccepted(
	db: Database,
	id: string,
): Promise<void> {
	await db
		.update(userInvitations)
		.set({ acceptedAt: new Date() })
		.where(eq(userInvitations.id, id));
}

export async function deleteInvitation(
	db: Database,
	id: string,
): Promise<boolean> {
	const rows = await db
		.delete(userInvitations)
		.where(eq(userInvitations.id, id))
		.returning({ id: userInvitations.id });
	return rows.length > 0;
}
