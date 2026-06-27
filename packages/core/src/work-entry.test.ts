import { expect, it } from "vitest";

import { MAX_DURATION_MINUTES } from "./duration";
import {
	createWorkEntryInputSchema,
	listWorkEntriesQuerySchema,
} from "./work-entry";

const base = {
	workspaceId: "ws1",
	projectId: "p1",
	durationMinutes: 90,
	description: "Implemented the report engine",
};

it("accepts a minimal entry and defaults tags", () => {
	const parsed = createWorkEntryInputSchema.parse(base);
	expect(parsed.tags).toEqual([]);
	expect(parsed.entryDate).toBeUndefined();
});

it("rejects non-positive or fractional durations", () => {
	expect(
		createWorkEntryInputSchema.safeParse({ ...base, durationMinutes: 0 })
			.success,
	).toBe(false);
	expect(
		createWorkEntryInputSchema.safeParse({ ...base, durationMinutes: -5 })
			.success,
	).toBe(false);
	expect(
		createWorkEntryInputSchema.safeParse({ ...base, durationMinutes: 1.5 })
			.success,
	).toBe(false);
});

it("accepts a duration at the one-year cap but rejects beyond it", () => {
	expect(
		createWorkEntryInputSchema.safeParse({
			...base,
			durationMinutes: MAX_DURATION_MINUTES,
		}).success,
	).toBe(true);
	expect(
		createWorkEntryInputSchema.safeParse({
			...base,
			durationMinutes: MAX_DURATION_MINUTES + 1,
		}).success,
	).toBe(false);
});

it("rejects an empty description", () => {
	expect(
		createWorkEntryInputSchema.safeParse({ ...base, description: "" }).success,
	).toBe(false);
});

it("coerces and defaults list query pagination", () => {
	const parsed = listWorkEntriesQuerySchema.parse({
		workspaceId: "ws1",
		limit: "10",
	});
	expect(parsed.limit).toBe(10);
	expect(parsed.offset).toBe(0);

	expect(
		listWorkEntriesQuerySchema.safeParse({ workspaceId: "ws1", limit: "500" })
			.success,
	).toBe(false);
});
