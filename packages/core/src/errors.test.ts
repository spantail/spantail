import { expect, it } from "vitest";

import { apiErrorSchema } from "./errors";

it("accepts a structured api error", () => {
	const parsed = apiErrorSchema.parse({
		error: { code: "not_found", message: "Resource not found" },
	});

	expect(parsed.error.code).toBe("not_found");
});

it("rejects an error without a code", () => {
	const result = apiErrorSchema.safeParse({ error: { message: "nope" } });

	expect(result.success).toBe(false);
});
