import { expect, it } from "vitest";

import {
	createWorkSpanInputSchema,
	listWorkSpansQuerySchema,
} from "./work-span";

const base = {
	workspaceId: "ws1",
	projectId: "p1",
	durationMinutes: 90,
	description: "Implemented the report engine",
};

it("accepts a minimal span and defaults tags", () => {
	const parsed = createWorkSpanInputSchema.parse(base);
	expect(parsed.tags).toEqual([]);
	expect(parsed.spanDate).toBeUndefined();
});

it("rejects non-positive or fractional durations", () => {
	expect(
		createWorkSpanInputSchema.safeParse({ ...base, durationMinutes: 0 })
			.success,
	).toBe(false);
	expect(
		createWorkSpanInputSchema.safeParse({ ...base, durationMinutes: -5 })
			.success,
	).toBe(false);
	expect(
		createWorkSpanInputSchema.safeParse({ ...base, durationMinutes: 1.5 })
			.success,
	).toBe(false);
});

it("rejects an empty description", () => {
	expect(
		createWorkSpanInputSchema.safeParse({ ...base, description: "" }).success,
	).toBe(false);
});

it("coerces and defaults list query pagination", () => {
	const parsed = listWorkSpansQuerySchema.parse({
		workspaceId: "ws1",
		limit: "10",
	});
	expect(parsed.limit).toBe(10);
	expect(parsed.offset).toBe(0);

	expect(
		listWorkSpansQuerySchema.safeParse({ workspaceId: "ws1", limit: "500" })
			.success,
	).toBe(false);
});
