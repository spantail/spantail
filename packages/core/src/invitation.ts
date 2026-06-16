import { z } from "zod";

import { passwordSchema } from "./user";

/** A pending invitation as listed for an instance admin. */
export const invitationSchema = z.object({
	id: z.string(),
	email: z.email(),
	grantAdmin: z.boolean(),
	expiresAt: z.string(),
	acceptedAt: z.string().nullable(),
	createdAt: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;

/** Instance admin invites a user by email (email delivery on path). */
export const createInvitationInputSchema = z.object({
	email: z.email(),
	grantAdmin: z.boolean().default(false),
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
