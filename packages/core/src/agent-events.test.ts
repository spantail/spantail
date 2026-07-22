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

	it("rejects an implausible event timestamp (range-bound like the other paths)", () => {
		// endedAt — the last-activity sort key — is the max event timestamp, so a
		// far-future instant would pin the session to the top of every listing.
		for (const timestamp of [
			"1970-01-01T00:00:00.000Z",
			new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
		]) {
			expect(
				ingestAgentEventsInputSchema.safeParse({
					sessionId: "s1",
					events: [{ ...validEvent, timestamp }],
				}).success,
			).toBe(false);
		}
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

	// Zod 4's z.number() rejects non-finite values by default; these lock that
	// in, since JSON "1e309" arrives as Infinity and would corrupt SQL sums.
	it("rejects non-finite numbers in costUsd and attribute values", () => {
		expect(
			ingestAgentEventsInputSchema.safeParse({
				sessionId: "s1",
				events: [{ ...validEvent, costUsd: Number.POSITIVE_INFINITY }],
			}).success,
		).toBe(false);
		expect(
			ingestAgentEventsInputSchema.safeParse({
				sessionId: "s1",
				events: [
					{ ...validEvent, attributes: { k: Number.POSITIVE_INFINITY } },
				],
			}).success,
		).toBe(false);
	});

	// The shape Claude Code actually sends: flat token buckets plus one level of
	// nested buckets. Rejecting these would 400 a real session's whole batch.
	it("accepts the real usage shape, nested buckets included", () => {
		const usage = {
			input_tokens: 5,
			cache_creation_input_tokens: 19681,
			cache_read_input_tokens: 0,
			output_tokens: 1,
			service_tier: "standard",
			cache_creation: {
				ephemeral_5m_input_tokens: 19681,
				ephemeral_1h_input_tokens: 0,
			},
			server_tool_use: { web_search_requests: 0 },
		};
		const parsed = ingestAgentEventsInputSchema.parse({
			sessionId: "s1",
			events: [{ ...validEvent, usage }],
		});
		expect(parsed.events[0]?.usage).toEqual(usage);
	});

	// Lenient on shape: an empty usage and unknown buckets stay valid, because
	// the transcript format is unversioned and read defensively downstream.
	it("accepts an empty usage and unknown scalar buckets", () => {
		const parsed = ingestAgentEventsInputSchema.parse({
			sessionId: "s1",
			events: [
				{ ...validEvent, usage: {} },
				{
					...validEvent,
					sourceId: "msg_B",
					usage: { future_bucket: 1, tier: null, throttled: false },
				},
			],
		});
		expect(parsed.events[0]?.usage).toEqual({});
		expect(parsed.events[1]?.usage).toMatchObject({ tier: null });
	});

	it("bounds usage: entry count, key/value length", () => {
		const tooManyKeys = Object.fromEntries(
			Array.from({ length: 21 }, (_, i) => [`k${i}`, 1]),
		);
		const tooManyNestedKeys = {
			cache_creation: Object.fromEntries(
				Array.from({ length: 21 }, (_, i) => [`k${i}`, 1]),
			),
		};
		for (const usage of [
			tooManyKeys,
			tooManyNestedKeys,
			{ ["k".repeat(101)]: 1 },
			{ cache_creation: { ["k".repeat(101)]: 1 } },
			{ service_tier: "x".repeat(201) },
			{ cache_creation: { tier: "x".repeat(201) } },
			// JSON "1e309" arrives as Infinity and would corrupt SQL sums.
			{ input_tokens: Number.POSITIVE_INFINITY },
		]) {
			expect(
				ingestAgentEventsInputSchema.safeParse({
					sessionId: "s1",
					events: [{ ...validEvent, usage }],
				}).success,
			).toBe(false);
		}
	});

	it("rejects a non-record usage", () => {
		for (const usage of [5, [1], "x", null]) {
			expect(
				ingestAgentEventsInputSchema.safeParse({
					sessionId: "s1",
					events: [{ ...validEvent, usage }],
				}).success,
			).toBe(false);
		}
	});

	// Out-of-shape values (arrays, nesting past one level) are pruned rather
	// than rejected: a shape rejection would 400 the session's whole batch on
	// any additive transcript change, and the Stop hook drops the failure
	// silently — a total, invisible ingest outage (#257).
	it("prunes usage.iterations and other out-of-shape values instead of rejecting", () => {
		const usage = {
			input_tokens: 2,
			output_tokens: 337,
			cache_creation: {
				ephemeral_1h_input_tokens: 48799,
				ephemeral_5m_input_tokens: 0,
			},
			iterations: [
				{
					type: "message",
					input_tokens: 2,
					output_tokens: 337,
					cache_creation: { ephemeral_1h_input_tokens: 48799 },
				},
			],
		};
		const parsed = ingestAgentEventsInputSchema.parse({
			sessionId: "s1",
			events: [
				{ ...validEvent, usage },
				{
					...validEvent,
					sourceId: "msg_B",
					usage: { weird: { ok: 1, deep: { x: 1 }, arr: [1] } },
				},
			],
		});
		// The array is gone; the one-level bucket survives untouched.
		expect(parsed.events[0]?.usage).toEqual({
			input_tokens: 2,
			output_tokens: 337,
			cache_creation: {
				ephemeral_1h_input_tokens: 48799,
				ephemeral_5m_input_tokens: 0,
			},
		});
		// Inside a bucket only the offending entries are dropped.
		expect(parsed.events[1]?.usage).toEqual({ weird: { ok: 1 } });
	});

	// The entry-count caps bound what is stored, so they apply after the prune.
	it("applies the usage entry cap to the surviving entries", () => {
		const scalars = (n: number) =>
			Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 1]));
		expect(
			ingestAgentEventsInputSchema.safeParse({
				sessionId: "s1",
				events: [{ ...validEvent, usage: { ...scalars(20), a: [1], b: [2] } }],
			}).success,
		).toBe(true);
		expect(
			ingestAgentEventsInputSchema.safeParse({
				sessionId: "s1",
				events: [{ ...validEvent, usage: { ...scalars(21), a: [1] } }],
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
