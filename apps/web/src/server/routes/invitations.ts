import {
	acceptInvitationInputSchema,
	createInvitationInputSchema,
	type Invitation,
	type InvitationPreview,
} from "@toxil/core";
import {
	createInvitation,
	deleteInvitation,
	findUserByEmail,
	getInstanceSettings,
	getInvitationByTokenHash,
	getPendingInvitationByEmail,
	type InvitationRow,
	listPendingInvitations,
	markInvitationAccepted,
	updateUser,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";
import { renderInvitationEmail } from "../emails/invitation-email";
import { createAccount } from "../lib/create-account";
import { AppError } from "../lib/errors";
import { getMailer } from "../lib/mail/mailer";
import { generateInviteToken, hashInviteToken } from "../lib/mail/token";
import { requireInstanceAdmin } from "../lib/permissions";
import { validate } from "../lib/validate";
import type { AppEnv } from "../types";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toInvitation(row: InvitationRow): Invitation {
	return {
		id: row.id,
		email: row.email,
		grantAdmin: row.grantAdmin,
		expiresAt: row.expiresAt.toISOString(),
		acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
		createdAt: row.createdAt.toISOString(),
	};
}

/** Resolves a raw token to a still-valid (unaccepted, unexpired) invitation. */
async function getValidInvitation(
	c: Context<AppEnv>,
	token: string,
): Promise<InvitationRow> {
	const row = await getInvitationByTokenHash(
		c.var.db,
		await hashInviteToken(token),
	);
	if (!row || row.acceptedAt || row.expiresAt.getTime() < Date.now()) {
		throw new AppError(
			"not_found",
			"This invitation is invalid or has expired",
		);
	}
	return row;
}

export const invitationRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireInstanceAdmin(c);
		const rows = await listPendingInvitations(c.var.db);
		return c.json(rows.map(toInvitation));
	})
	.post("/", async (c) => {
		const { user: actor } = requireInstanceAdmin(c);
		const input = validate(createInvitationInputSchema, await c.req.json());

		const settings = await getInstanceSettings(c.var.db);
		if (!settings?.emailEnabled) {
			throw new AppError(
				"forbidden",
				"Email delivery is disabled; create the user directly instead",
			);
		}
		if (await findUserByEmail(c.var.db, input.email)) {
			throw new AppError("conflict", "A user with this email already exists");
		}
		if (await getPendingInvitationByEmail(c.var.db, input.email)) {
			throw new AppError(
				"conflict",
				"This email already has a pending invitation",
			);
		}

		const token = generateInviteToken();
		const invitation = await createInvitation(c.var.db, {
			email: input.email,
			tokenHash: await hashInviteToken(token),
			invitedByUserId: actor.id,
			grantAdmin: input.grantAdmin,
			expiresAt: new Date(Date.now() + INVITE_TTL_MS),
		});

		const inviteUrl = `${c.env.BETTER_AUTH_URL.replace(/\/$/, "")}/invite/${token}`;
		const { subject, html, text } = await renderInvitationEmail(inviteUrl);
		const mailer = getMailer(c.env, {
			address: settings.emailFromAddress,
			name: settings.emailFromName,
		});
		await mailer.send({ to: input.email, subject, html, text });

		return c.json(toInvitation(invitation), 201);
	})
	.delete("/:id", async (c) => {
		requireInstanceAdmin(c);
		const deleted = await deleteInvitation(c.var.db, c.req.param("id"));
		if (!deleted) throw new AppError("not_found", "Invitation not found");
		return c.body(null, 204);
	})
	// Public: the invitee has no account yet, so these skip auth.
	.get("/accept/:token", async (c) => {
		const invitation = await getValidInvitation(c, c.req.param("token"));
		return c.json({ email: invitation.email } satisfies InvitationPreview);
	})
	.post("/accept/:token", async (c) => {
		const input = validate(acceptInvitationInputSchema, await c.req.json());
		const invitation = await getValidInvitation(c, c.req.param("token"));

		if (await findUserByEmail(c.var.db, invitation.email)) {
			throw new AppError(
				"conflict",
				"An account for this email already exists",
			);
		}
		const userId = await createAccount(c, {
			email: invitation.email,
			name: input.name,
			password: input.password,
		});
		if (invitation.grantAdmin) {
			await updateUser(c.var.db, userId, { isAdmin: true });
		}
		await markInvitationAccepted(c.var.db, invitation.id);
		return c.body(null, 201);
	});
