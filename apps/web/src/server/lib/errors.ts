import type { ErrorCode } from "@spantail/core";
import type { Context } from "hono";

const STATUS_BY_CODE: Record<
	ErrorCode,
	400 | 401 | 403 | 404 | 409 | 429 | 500
> = {
	bad_request: 400,
	unauthorized: 401,
	forbidden: 403,
	insufficient_scope: 403,
	not_found: 404,
	conflict: 409,
	rate_limited: 429,
	internal: 500,
};

export class AppError extends Error {
	constructor(
		readonly code: ErrorCode,
		message: string,
	) {
		super(message);
		this.name = "AppError";
	}

	get status() {
		return STATUS_BY_CODE[this.code];
	}
}

export function errorResponse(c: Context, error: unknown): Response {
	if (error instanceof AppError) {
		return c.json(
			{ error: { code: error.code, message: error.message } },
			error.status,
		);
	}
	console.error("unhandled error", error);
	return c.json(
		{ error: { code: "internal", message: "Internal server error" } },
		500,
	);
}
