import { z } from "zod";

/** Instance-wide email delivery settings (Cloudflare Email Service). */
export const emailSettingsSchema = z.object({
	emailEnabled: z.boolean(),
	emailFromAddress: z.email().nullable(),
	emailFromName: z.string().max(100).nullable(),
});
export type EmailSettings = z.infer<typeof emailSettingsSchema>;

export const updateEmailSettingsInputSchema = z.object({
	emailEnabled: z.boolean(),
	// Optional so callers can update one field at a time; the API requires a
	// from address to be present when enabling delivery.
	emailFromAddress: z.email().nullable().optional(),
	emailFromName: z.string().max(100).nullable().optional(),
});
export type UpdateEmailSettingsInput = z.infer<
	typeof updateEmailSettingsInputSchema
>;
