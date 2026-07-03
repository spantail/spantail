import { describe, expect, it } from "vitest";

import { ingestAgentEventsInputSchema } from "./agent-events";

const validEvent = {
	sourceId: "msg_A",
	timestamp: "2026-06-20T01:00:00.000Z",
	usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3 },
};

describe("ingestAgentEventsInputSchema", () => {
	it("accepts a session with events and preserves the raw usage object", () => {
		const parsed = ingestAgentEventsInputSchema.parse({
			sessionId: "s1",
			events: [{ ...validEvent, model: "claude-opus-4-8" }],
		});
		expect(parsed.events).toHaveLength(1);
		// Unknown usage buckets pass through untouched (schema-on-read).
		expect(parsed.events[0]?.usage).toMatchObject({
			input_tokens: 1,
			cache_read_input_tokens: 3,
		});
	});

	it("rejects an empty events array", () => {
		expect(
			ingestAgentEventsInputSchema.safeParse({ sessionId: "s1", events: [] })
				.success,
		).toBe(false);
	});

	it("rejects a non-ISO timestamp", () => {
		const res = ingestAgentEventsInputSchema.safeParse({
			sessionId: "s1",
			events: [{ ...validEvent, timestamp: "yesterday" }],
		});
		expect(res.success).toBe(false);
	});

	it("rejects an empty/whitespace projectId at the boundary", () => {
		const res = ingestAgentEventsInputSchema.safeParse({
			sessionId: "s1",
			projectId: "   ",
			events: [validEvent],
		});
		expect(res.success).toBe(false);
	});

	it("requires sourceId and usage on each event", () => {
		expect(
			ingestAgentEventsInputSchema.safeParse({
				sessionId: "s1",
				events: [{ timestamp: validEvent.timestamp, usage: {} }],
			}).success,
		).toBe(false);
	});

	it("defaults operation to chat and accepts a custom one", () => {
		const parsed = ingestAgentEventsInputSchema.parse({
			sessionId: "s1",
			events: [
				validEvent,
				{ ...validEvent, sourceId: "msg_B", operation: "execute_tool" },
			],
		});
		expect(parsed.events[0]?.operation).toBe("chat");
		expect(parsed.events[1]?.operation).toBe("execute_tool");
	});

	it("accepts bounded attributes and a costUsd", () => {
		const parsed = ingestAgentEventsInputSchema.parse({
			sessionId: "s1",
			events: [
				{
					...validEvent,
					costUsd: 0.42,
					attributes: {
						"vcs.ref.head.name": "feature/123-foo",
						"app.version": "2.1.0",
					},
				},
			],
		});
		expect(parsed.events[0]?.costUsd).toBe(0.42);
		expect(parsed.events[0]?.attributes?.["vcs.ref.head.name"]).toBe(
			"feature/123-foo",
		);
	});

	it("rejects a negative costUsd", () => {
		expect(
			ingestAgentEventsInputSchema.safeParse({
				sessionId: "s1",
				events: [{ ...validEvent, costUsd: -1 }],
			}).success,
		).toBe(false);
	});

	it("bounds attributes: entry count, value length, scalar values only", () => {
		const tooMany = Object.fromEntries(
			Array.from({ length: 21 }, (_, i) => [`k${i}`, "v"]),
		);
		for (const attributes of [
			tooMany,
			{ k: "x".repeat(501) },
			{ k: { nested: true } },
		]) {
			expect(
				ingestAgentEventsInputSchema.safeParse({
					sessionId: "s1",
					events: [{ ...validEvent, attributes }],
				}).success,
			).toBe(false);
		}
	});
});
