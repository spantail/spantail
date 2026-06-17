import type { Context } from "hono";
import type { AppEnv } from "../types";
import { AppError } from "./errors";

/** Parses a request body as JSON, treating an empty body as `{}`. */
export async function parseOptionalJsonBody(
	c: Context<AppEnv>,
): Promise<unknown> {
	const rawBody = await c.req.text();
	if (rawBody.trim() === "") return {};
	try {
		return JSON.parse(rawBody);
	} catch {
		throw new AppError("bad_request", "Request body must be valid JSON");
	}
}
