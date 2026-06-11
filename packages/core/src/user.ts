import { z } from "zod";

/** The authenticated user as exposed by the API (subset of the auth table). */
export const authUserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.email(),
	isAdmin: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;
