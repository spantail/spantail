import type { z } from "zod";

import { AppError } from "./errors";

/** Parse `data` with `schema`, throwing a structured 400 on failure. */
export function validate<S extends z.ZodType>(
	schema: S,
	data: unknown,
): z.output<S> {
	const result = schema.safeParse(data);
	if (!result.success) {
		const issue = result.error.issues[0];
		const path = issue?.path.join(".");
		const message = issue
			? `${path ? `${path}: ` : ""}${issue.message}`
			: "Invalid request";
		throw new AppError("bad_request", message);
	}
	return result.data;
}
