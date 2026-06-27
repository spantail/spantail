import { expect, it } from "vitest";

import { ingestAgentEntryInputSchema } from "./agent";
import { MAX_DURATION_MINUTES } from "./duration";

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
