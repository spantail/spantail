import {
	createWorkEntryInputSchema,
	listWorkEntriesQuerySchema,
	todayInTimezone,
	updateWorkEntryInputSchema,
} from "@toxil/core";
import {
	createWorkEntry,
	deleteWorkEntry,
	getProjectById,
	getWorkEntryById,
	listWorkEntries,
	updateWorkEntry,
	type WorkEntryRow,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

async function requireProjectInWorkspace(
	c: Context<AppEnv>,
	projectId: string,
	workspaceId: string,
): Promise<void> {
	const project = await getProjectById(c.var.db, projectId);
	if (!project || project.workspaceId !== workspaceId) {
		throw new AppError(
			"bad_request",
			"Project does not belong to this workspace",
		);
	}
}

async function requireEntryAccess(
	c: Context<AppEnv>,
	id: string,
): Promise<WorkEntryRow> {
	const entry = await getWorkEntryById(c.var.db, id);
	if (!entry) throw new AppError("not_found", "Work entry not found");
	await requireWorkspaceAccess(c, entry.workspaceId);
	return entry;
}

function requireAuthor(c: Context<AppEnv>, entry: WorkEntryRow): void {
	const { user } = requireAuth(c);
	if (entry.userId !== user.id) {
		throw new AppError("forbidden", "Only the author can modify a work entry");
	}
}

export const workEntryRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const query = validate(listWorkEntriesQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(await listWorkEntries(c.var.db, query));
	})
	.post("/", async (c) => {
		const { user } = requireAuth(c);
		const input = validate(createWorkEntryInputSchema, await c.req.json());
		const { workspace } = await requireWorkspaceAccess(c, input.workspaceId);
		await requireProjectInWorkspace(c, input.projectId, input.workspaceId);

		const entry = await createWorkEntry(c.var.db, {
			workspaceId: input.workspaceId,
			projectId: input.projectId,
			userId: user.id,
			entryDate: input.entryDate ?? todayInTimezone(workspace.timezone),
			durationMinutes: input.durationMinutes,
			startedAt: input.startedAt ? new Date(input.startedAt) : null,
			endedAt: input.endedAt ? new Date(input.endedAt) : null,
			description: input.description,
			note: input.note ?? null,
			tags: input.tags,
		});
		return c.json(entry, 201);
	})
	.get("/:id", async (c) => {
		const entry = await requireEntryAccess(c, c.req.param("id"));
		return c.json(entry);
	})
	.patch("/:id", async (c) => {
		const entry = await requireEntryAccess(c, c.req.param("id"));
		requireAuthor(c, entry);
		const input = validate(updateWorkEntryInputSchema, await c.req.json());
		if (input.projectId) {
			await requireProjectInWorkspace(c, input.projectId, entry.workspaceId);
		}
		const { startedAt, endedAt, ...rest } = input;
		const updated = await updateWorkEntry(c.var.db, entry.id, {
			...rest,
			...(startedAt === undefined
				? {}
				: { startedAt: startedAt ? new Date(startedAt) : null }),
			...(endedAt === undefined
				? {}
				: { endedAt: endedAt ? new Date(endedAt) : null }),
		});
		return c.json(updated);
	})
	.delete("/:id", async (c) => {
		const entry = await requireEntryAccess(c, c.req.param("id"));
		requireAuthor(c, entry);
		await deleteWorkEntry(c.var.db, entry.id);
		return c.body(null, 204);
	});
