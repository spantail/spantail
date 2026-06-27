import { expect, it } from "vitest";

import { ingestAgentEntryInputSchema } from "./agent";
import { MAX_DURATION_MINUTES } from "./duration";

// Timestamps are validated relative to "now", so build them from the current
// clock rather than fixed literals.
const recent = new Date(Date.now() - 60_000).toISOString();
const base = {
	sessionId: "session-1",
	durationMinutes: 30,
};

it("accepts an agent duration at the one-year cap but rejects beyond it", () => {
	expect(
		ingestAgentEntryInputSchema.safeParse({
			...base,
			durationMinutes: MAX_DURATION_MINUTES,
		}).success,
	).toBe(true);
	expect(
		ingestAgentEntryInputSchema.safeParse({
			...base,
			durationMinutes: MAX_DURATION_MINUTES + 1,
		}).success,
	).toBe(false);
});

it("still accepts a zero agent duration", () => {
	expect(
		ingestAgentEntryInputSchema.safeParse({ ...base, durationMinutes: 0 })
			.success,
	).toBe(true);
});

it("accepts an ingest payload with in-range timestamps", () => {
	const result = ingestAgentEntryInputSchema.safeParse({
		...base,
		startedAt: new Date(Date.now() - 120_000).toISOString(),
		endedAt: recent,
	});
	expect(result.success).toBe(true);
});

it("accepts a payload with no timestamps", () => {
	expect(ingestAgentEntryInputSchema.safeParse(base).success).toBe(true);
});

it("rejects a backdated startedAt", () => {
	const result = ingestAgentEntryInputSchema.safeParse({
		...base,
		startedAt: "1970-01-01T00:00:00.000Z",
	});
	expect(result.success).toBe(false);
});

it("rejects a far-future endedAt", () => {
	const result = ingestAgentEntryInputSchema.safeParse({
		...base,
		endedAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
	});
	expect(result.success).toBe(false);
});

it("rejects endedAt before startedAt", () => {
	const result = ingestAgentEntryInputSchema.safeParse({
		...base,
		startedAt: recent,
		endedAt: new Date(Date.now() - 120_000).toISOString(),
	});
	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.error.issues.some((i) => i.path.includes("endedAt"))).toBe(
			true,
		);
	}
});
