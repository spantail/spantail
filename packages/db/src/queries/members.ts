import { and, eq } from "drizzle-orm";

import type { Database } from "../index";
import { user } from "../schema/auth";
import { workspaceMembers } from "../schema/domain";

export async function listMembers(db: Database, workspaceId: string) {
	const rows = await db
		.select({
			workspaceId: workspaceMembers.workspaceId,
			userId: workspaceMembers.userId,
			role: workspaceMembers.role,
			createdAt: workspaceMembers.createdAt,
			name: user.name,
			email: user.email,
		})
		.from(workspaceMembers)
		.innerJoin(user, eq(workspaceMembers.userId, user.id))
		.where(eq(workspaceMembers.workspaceId, workspaceId))
		.orderBy(workspaceMembers.createdAt);
	return rows;
}

export async function addMember(
	db: Database,
	input: { workspaceId: string; userId: string; role: "admin" | "member" },
) {
	await db.insert(workspaceMembers).values(input);
}

export async function removeMember(
	db: Database,
	workspaceId: string,
	userId: string,
) {
	await db
		.delete(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, workspaceId),
				eq(workspaceMembers.userId, userId),
			),
		);
}
