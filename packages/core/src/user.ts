import { z } from "zod";

import { oauthProviderSchema } from "./instance";

/** The authenticated user as exposed by the API (subset of the auth table). */
export const authUserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.email(),
	isAdmin: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** A user as listed in the instance-wide admin user management screen. */
export const managedUserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.email(),
	isAdmin: z.boolean(),
	createdAt: z.string(),
	// Social login providers linked to this account (empty for password-only
	// users). Lets the admin see at a glance how each user signs in.
	providers: z.array(oauthProviderSchema),
});
export type ManagedUser = z.infer<typeof managedUserSchema>;

/** Account passwords; min length mirrors Better Auth's default (8). */
export const passwordSchema = z.string().min(8).max(128);

const userNameSchema = z.string().min(1).max(100);

/** Instance admin creates a user directly (email delivery off path). */
export const createUserInputSchema = z.object({
	email: z.email(),
	name: userNameSchema,
	grantAdmin: z.boolean().default(false),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type CreateUserInputData = z.input<typeof createUserInputSchema>;

/** A created user, plus the one-time generated password when email is off. */
export const createdUserSchema = managedUserSchema.extend({
	generatedPassword: z.string().optional(),
});
export type CreatedUser = z.infer<typeof createdUserSchema>;

/** Instance admin edits a user's display name and/or admin flag. */
export const updateUserInputSchema = z
	.object({
		name: userNameSchema,
		isAdmin: z.boolean(),
	})
	.partial();
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
