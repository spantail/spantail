import { expect, it } from "vitest";

import {
	type AgentEntry,
	finalizeAgentSessionInputSchema,
	ingestAgentEntryInputSchema,
	summarizeAgentSessions,
} from "./agent";
import { MAX_DURATION_MINUTES } from "./duration";

type Session = Pick<AgentEntry, "durationMinutes" | "usage">;
const session = (
	durationMinutes: number,
	usage: Session["usage"],
): Session => ({
	durationMinutes,
	usage,
});

// Timestamps are validated relative to "now". Build them at test-time off the
// current clock (not a module-level constant, which Vitest can evaluate long
// before a test runs and let the values go stale, flipping ordering checks).
const minutesAgo = (n: number) =>
	new Date(Date.now() - n * 60_000).toISOString();
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
		startedAt: minutesAgo(2),
		endedAt: minutesAgo(1),
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
		startedAt: minutesAgo(1),
		endedAt: minutesAgo(2),
	});
	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.error.issues.some((i) => i.path.includes("endedAt"))).toBe(
			true,
		);
	}
});

it("accepts a bounded context on the summary and finalize paths", () => {
	const context = { models: ["gpt-5"], refs: ["github:acme/app#12"] };
	expect(
		ingestAgentEntryInputSchema.safeParse({ ...base, context }).success,
	).toBe(true);
	const finalized = finalizeAgentSessionInputSchema.parse({
		sessionId: "s1",
		endedAt: minutesAgo(1),
		description: "Fixed the flaky login test",
		context,
	});
	// Finalize only owns refs; rollup-owned facets are stripped, so a
	// SessionEnd can never overwrite what the events actually said.
	expect(finalized.context).toEqual({ refs: ["github:acme/app#12"] });
});

it("bounds context facets: value count and length", () => {
	const tooMany = { refs: Array.from({ length: 21 }, (_, i) => `r${i}`) };
	const tooLong = { refs: ["x".repeat(201)] };
	for (const context of [tooMany, tooLong]) {
		expect(
			finalizeAgentSessionInputSchema.safeParse({ sessionId: "s1", context })
				.success,
		).toBe(false);
	}
	// The summary path accepts every facet, so bound one there too.
	expect(
		ingestAgentEntryInputSchema.safeParse({
			...base,
			context: { branches: ["x".repeat(201)] },
		}).success,
	).toBe(false);
});

it("rejects an implausible finalize endedAt", () => {
	expect(
		finalizeAgentSessionInputSchema.safeParse({
			sessionId: "s1",
			endedAt: "1970-01-01T00:00:00.000Z",
		}).success,
	).toBe(false);
});

it("summarizes linked sessions with input/output buckets", () => {
	expect(
		summarizeAgentSessions([
			session(30, { totalTokens: 1000, inputTokens: 400, outputTokens: 600 }),
			session(15, { totalTokens: 500, inputTokens: 200, outputTokens: 300 }),
		]),
	).toEqual({
		sessionCount: 2,
		totalMinutes: 45,
		totalTokens: 1500,
		totalInputTokens: 600,
		totalOutputTokens: 900,
	});
});

it("sums only the sessions that expose a bucket (partial sums)", () => {
	// One session omits the input/output split and one has no usage at all; both
	// contribute 0 to those buckets, so their sum stays below totalTokens.
	expect(
		summarizeAgentSessions([
			session(10, { totalTokens: 100, inputTokens: 40, outputTokens: 60 }),
			session(20, { totalTokens: 200 }),
			session(5, null),
		]),
	).toEqual({
		sessionCount: 3,
		totalMinutes: 35,
		totalTokens: 300,
		totalInputTokens: 40,
		totalOutputTokens: 60,
	});
});

it("is empty for no sessions", () => {
	expect(summarizeAgentSessions([])).toEqual({
		sessionCount: 0,
		totalMinutes: 0,
		totalTokens: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
	});
});
