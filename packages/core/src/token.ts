import { z } from "zod";

export const tokenScopeSchema = z.enum(["read", "write", "admin"]);
export type TokenScope = z.infer<typeof tokenScopeSchema>;

export const apiTokenSchema = z.object({
	id: z.string(),
	name: z.string(),
	scopes: z.array(tokenScopeSchema).min(1),
	lastUsedAt: z.string().nullable(),
	expiresAt: z.string().nullable(),
	createdAt: z.string(),
});
export type ApiToken = z.infer<typeof apiTokenSchema>;

export const createTokenInputSchema = z.object({
	name: z.string().min(1).max(100),
	scopes: z.array(tokenScopeSchema).min(1),
	expiresInDays: z.number().int().min(1).max(3650).optional(),
});
export type CreateTokenInput = z.infer<typeof createTokenInputSchema>;
