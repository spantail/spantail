import { z } from "zod";

export const errorCodeSchema = z.enum([
	"bad_request",
	"unauthorized",
	"forbidden",
	"insufficient_scope",
	"not_found",
	"conflict",
	"rate_limited",
	"internal",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
	}),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
