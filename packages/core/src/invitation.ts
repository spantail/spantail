import { z } from "zod";

import { passwordSchema } from "./user";

/** A pending invitation as listed for an instance admin. */
export const invitationSchema = z.object({
	id: z.string(),
	email: z.email(),
	grantAdmin: z.boolean(),
	// Whether accepting also grants the template-author capability.
	grantTemplateAuthor: z.boolean(),
	expiresAt: z.string(),
	acceptedAt: z.string().nullable(),
	createdAt: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;

/** Instance admin invites a user by email (email delivery on path). */
export const createInvitationInputSchema = z.object({
	// Lowercased so the stored invitation matches the email Better Auth records
	// (it lowercases every account email); a Google/GitHub sign-in then resolves
	// its standing invitation reliably regardless of how it was typed.
	email: z.email().toLowerCase(),
	grantAdmin: z.boolean().default(false),
	// Grant the template-author capability when the invitation is accepted.
	grantTemplateAuthor: z.boolean().default(false),
});
export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;
export type CreateInvitationInputData = z.input<
	typeof createInvitationInputSchema
>;

/** Public token-check response shown on the accept page. */
export const invitationPreviewSchema = z.object({
	email: z.email(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

/** The invitee sets their own name and password when accepting. */
export const acceptInvitationInputSchema = z.object({
	name: z.string().min(1).max(100),
	password: passwordSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;
