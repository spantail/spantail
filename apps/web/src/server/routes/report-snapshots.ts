import {
	createReportShareInputSchema,
	generateShareToken,
	hashSharePasscode,
} from "@toxil/core";
import {
	createReportShare,
	deleteReportSnapshot,
	getReportSnapshotById,
	listReportSharesBySnapshot,
	type ReportShareRow,
	type ReportSnapshotRow,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireScopeWorkspaces } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";
import { requireReportOwner } from "./reports";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Snapshots inherit access from their parent report's owner. */
export async function requireSnapshotAccess(
	c: Context<AppEnv>,
	id: string,
): Promise<ReportSnapshotRow> {
	const snapshot = await getReportSnapshotById(c.var.db, id);
	if (!snapshot) throw new AppError("not_found", "Report snapshot not found");
	await requireReportOwner(c, snapshot.reportId);
	return snapshot;
}

/** API shape of a share: the passcode hash never leaves the server. */
export function toApiShare(row: ReportShareRow) {
	const { passcodeHash, ...rest } = row;
	return { ...rest, hasPasscode: passcodeHash !== null };
}

export const reportSnapshotRoutes = new Hono<AppEnv>()
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const snapshot = await requireSnapshotAccess(c, c.req.param("id"));
		// The rendered markdown is workspace data: losing membership in any
		// scoped workspace also revokes access to the frozen snapshot content.
		// Deletion stays owner-only — removing data needs no membership.
		await requireScopeWorkspaces(c, snapshot.resolvedScope.workspaceIds);
		return c.json(snapshot);
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const snapshot = await requireSnapshotAccess(c, c.req.param("id"));
		await deleteReportSnapshot(c.var.db, snapshot.id);
		return c.body(null, 204);
	})
	// Minting a public link is at least as sensitive as reading the snapshot,
	// so it carries the same membership re-check as the snapshot GET above.
	.post("/:id/shares", async (c) => {
		requireScope(c, "write");
		const snapshot = await requireSnapshotAccess(c, c.req.param("id"));
		await requireScopeWorkspaces(c, snapshot.resolvedScope.workspaceIds);
		// Every field is optional, so a body-less POST is legitimate — but a
		// present, malformed body is rejected rather than silently minting a
		// no-expiry public link.
		const rawBody = await c.req.text();
		let body: unknown = {};
		if (rawBody !== "") {
			try {
				body = JSON.parse(rawBody);
			} catch {
				throw new AppError("bad_request", "Request body must be valid JSON");
			}
		}
		const input = validate(createReportShareInputSchema, body);
		const share = await createReportShare(c.var.db, {
			snapshotId: snapshot.id,
			token: generateShareToken(),
			passcodeHash: input.passcode
				? await hashSharePasscode(input.passcode)
				: null,
			expiresAt: input.expiresInDays
				? new Date(Date.now() + input.expiresInDays * DAY_MS)
				: null,
		});
		return c.json(toApiShare(share), 201);
	})
	// Listed shares include plaintext tokens (content capabilities), so the
	// list needs the membership re-check too.
	.get("/:id/shares", async (c) => {
		requireScope(c, "read");
		const snapshot = await requireSnapshotAccess(c, c.req.param("id"));
		await requireScopeWorkspaces(c, snapshot.resolvedScope.workspaceIds);
		const shares = await listReportSharesBySnapshot(c.var.db, snapshot.id);
		return c.json(shares.map(toApiShare));
	});
