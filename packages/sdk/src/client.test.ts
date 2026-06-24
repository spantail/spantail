import { expect, it } from "vitest";

import { SpantailApiError, SpantailClient } from "./index";

function stubClient(status: number, body: unknown) {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const client = new SpantailClient({
		baseUrl: "https://spantail.example.com/",
		token: "spantail_pat_test",
		fetch: ((url: string, init?: RequestInit) => {
			calls.push({ url, init });
			return Promise.resolve(
				new Response(body === undefined ? null : JSON.stringify(body), {
					status,
				}),
			);
		}) as typeof fetch,
	});
	return { client, calls };
}

it("builds urls, query strings, and auth headers", async () => {
	const { client, calls } = stubClient(200, []);

	await client.listWorkEntries({
		workspaceId: "ws1",
		from: "2026-06-01",
		limit: 10,
	});

	expect(calls).toHaveLength(1);
	const call = calls[0];
	if (!call) throw new Error("expected a fetch call");
	expect(call.url).toBe(
		"https://spantail.example.com/api/v1/work-entries?workspaceId=ws1&from=2026-06-01&limit=10",
	);
	expect((call.init?.headers as Record<string, string>).authorization).toBe(
		"Bearer spantail_pat_test",
	);
});

it("posts json bodies with content type", async () => {
	const { client, calls } = stubClient(201, { id: "e1" });

	await client.createWorkEntry({
		workspaceId: "ws1",
		projectId: "p1",
		durationMinutes: 30,
		description: "done",
	});

	const call = calls[0];
	if (!call) throw new Error("expected a fetch call");
	expect(call.init?.method).toBe("POST");
	expect((call.init?.headers as Record<string, string>)["content-type"]).toBe(
		"application/json",
	);
	expect(JSON.parse(String(call.init?.body))).toMatchObject({
		workspaceId: "ws1",
	});
});

it("maps structured errors to SpantailApiError", async () => {
	const { client } = stubClient(403, {
		error: {
			code: "forbidden",
			message: "Only the author can modify a work entry",
		},
	});

	const error = await client
		.updateWorkEntry("e1", { durationMinutes: 1 })
		.catch((e) => e);

	expect(error).toBeInstanceOf(SpantailApiError);
	expect(error.status).toBe(403);
	expect(error.code).toBe("forbidden");
	expect(error.message).toMatch(/author/);
});

it("returns undefined for 204 responses", async () => {
	const { client } = stubClient(204, undefined);

	await expect(client.deleteWorkEntry("e1")).resolves.toBeUndefined();
});
