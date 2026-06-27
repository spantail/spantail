import { env } from "cloudflare:test";
import type { RealtimeEvent } from "@spantail/core";
import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

/** Reads the SSE stream until the next `data:` frame and parses it. */
async function nextEvent(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	decoder = new TextDecoder(),
): Promise<RealtimeEvent> {
	let buffer = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) throw new Error("SSE stream closed before a data frame arrived");
		buffer += decoder.decode(value, { stream: true });
		const start = buffer.indexOf("data: ");
		const end = start === -1 ? -1 : buffer.indexOf("\n", start);
		if (start !== -1 && end !== -1) {
			return JSON.parse(buffer.slice(start + "data: ".length, end));
		}
	}
}

it("relays a published event to every open connection of a user's hub", async () => {
	const stub = env.USER_HUB.getByName("user-1");
	const a = (await stub.fetch(new Request("https://hub/"))).body?.getReader();
	const b = (await stub.fetch(new Request("https://hub/"))).body?.getReader();
	if (!a || !b) throw new Error("no SSE body");

	// publish dispatches writes fire-and-forget, so it resolves without blocking.
	await stub.publish(JSON.stringify({ type: "project", workspaceId: "w1" }));

	expect(await nextEvent(a)).toEqual({ type: "project", workspaceId: "w1" });
	expect(await nextEvent(b)).toEqual({ type: "project", workspaceId: "w1" });
	await a.cancel();
	await b.cancel();
});

it("returns the event stream content type for a session caller", async () => {
	const cookie = await signUpUser("Owner", "owner@example.com");
	const res = await appFetch("/api/v1/realtime", { headers: { cookie } });
	expect(res.status).toBe(200);
	expect(res.headers.get("content-type")).toContain("text/event-stream");
	await res.body?.cancel();
});

it("rejects an unauthenticated subscriber", async () => {
	const res = await appFetch("/api/v1/realtime");
	expect(res.status).toBe(401);
	await res.body?.cancel();
});

it("pushes a workspace write to every member's stream", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			admin,
		)
	).json()) as { id: string };
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		admin,
	);
	const memberId = (
		(await (await apiGet("/api/v1/me", member)).json()) as {
			user: { id: string };
		}
	).user.id;
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "spantail", name: "Spantail", memberUserIds: [memberId] },
			admin,
		)
	).json()) as { id: string };

	// The member is listening; the admin's write must surface on their stream.
	const sse = await appFetch("/api/v1/realtime", {
		headers: { cookie: member },
	});
	const reader = sse.body?.getReader();
	if (!reader) throw new Error("no SSE body");

	const created = await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws.id,
			projectId: project.id,
			durationMinutes: 30,
			description: "Logged by the admin",
		},
		admin,
	);
	expect(created.status).toBe(201);

	const event = await nextEvent(reader);
	expect(event).toEqual({ type: "work-entry", workspaceId: ws.id });
	await reader.cancel();
});
