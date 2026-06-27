import type { RealtimeEvent } from "@spantail/core";
import {
	listReportParticipantUserIds,
	listWorkspaceMemberIds,
} from "@spantail/db";
import type { Context } from "hono";

import type { AppEnv } from "../types";

/**
 * Run a fan-out in the background. Realtime delivery is best-effort: a failure
 * (a transient DB lookup or DO error) must never surface as an unhandled
 * rejection or affect the response, so errors are swallowed.
 */
function deliver(c: Context<AppEnv>, work: Promise<unknown>): void {
	c.executionCtx.waitUntil(work.catch(() => {}));
}

function fanOut(
	c: Context<AppEnv>,
	userIds: string[],
	payload: string,
): Promise<unknown> {
	return Promise.all(
		userIds.map((id) => c.env.USER_HUB.getByName(id).publish(payload)),
	);
}

/**
 * Relay a lightweight invalidation signal to one user's hub. Fire-and-forget; a
 * hub with no open connections simply drops it.
 */
export function publishToUser(
	c: Context<AppEnv>,
	userId: string,
	event: RealtimeEvent,
): void {
	deliver(c, c.env.USER_HUB.getByName(userId).publish(JSON.stringify(event)));
}

/** Relay a signal to several users at once (e.g. a report's recipients). */
export function publishToUsers(
	c: Context<AppEnv>,
	userIds: string[],
	event: RealtimeEvent,
): void {
	deliver(c, fanOut(c, userIds, JSON.stringify(event)));
}

/**
 * Relay a workspace-scoped signal to every member of the workspace. The member
 * lookup and fan-out run in the background so the write response is not delayed.
 */
export function publishToWorkspace(
	c: Context<AppEnv>,
	event: RealtimeEvent & { workspaceId: string },
): void {
	const payload = JSON.stringify(event);
	deliver(
		c,
		(async () => {
			const ids = await listWorkspaceMemberIds(c.var.db, event.workspaceId);
			await fanOut(c, ids, payload);
		})(),
	);
}

/**
 * Relay a discussion-changed signal to a report's participants (owner +
 * Send-to recipients). The participant lookup runs in the background.
 */
export function publishToReportParticipants(
	c: Context<AppEnv>,
	reportId: string,
): void {
	const payload = JSON.stringify({
		type: "report-discussion",
		id: reportId,
	} satisfies RealtimeEvent);
	deliver(
		c,
		(async () => {
			const ids = await listReportParticipantUserIds(c.var.db, reportId);
			await fanOut(c, ids, payload);
		})(),
	);
}
