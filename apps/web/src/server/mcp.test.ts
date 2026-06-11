import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../test/helpers";

const MCP_HEADERS = {
	"content-type": "application/json",
	accept: "application/json, text/event-stream",
	"mcp-protocol-version": "2025-11-25",
};

async function setup() {
	const cookie = await signUpUser("Admin", "admin@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			cookie,
		)
	).json()) as { id: string };
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "toxil", name: "Toxil" },
			cookie,
		)
	).json()) as { id: string };
	const token = (
		(await (
			await apiJson(
				"POST",
				"/api/v1/tokens",
				{ name: "mcp", scopes: ["read", "write"] },
				cookie,
			)
		).json()) as { token: string }
	).token;
	return { cookie, ws, project, token };
}

function rpc(token: string, body: unknown) {
	return appFetch("/mcp", {
		method: "POST",
		headers: { ...MCP_HEADERS, authorization: `Bearer ${token}` },
		body: JSON.stringify(body),
	});
}

async function rpcResult<T>(res: Response): Promise<T> {
	expect(res.status).toBe(200);
	const payload = (await res.json()) as { result?: T; error?: unknown };
	expect(payload.error).toBeUndefined();
	if (payload.result === undefined) throw new Error("missing JSON-RPC result");
	return payload.result;
}

it("rejects unauthenticated mcp requests with a 401 challenge", async () => {
	const anon = await appFetch("/mcp", {
		method: "POST",
		headers: MCP_HEADERS,
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {},
		}),
	});
	expect(anon.status).toBe(401);
	expect(anon.headers.get("www-authenticate")).toContain("Bearer");

	const badToken = await appFetch("/mcp", {
		method: "POST",
		headers: {
			...MCP_HEADERS,
			authorization: "Bearer toxil_pat_invalidinvalidinvalidinvalidinvalidinv",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {},
		}),
	});
	expect(badToken.status).toBe(401);
});

it("serves the full stateless json-rpc flow and writes through the api", async () => {
	const { cookie, ws, project, token } = await setup();

	// initialize
	const init = await rpc(token, {
		jsonrpc: "2.0",
		id: 1,
		method: "initialize",
		params: {
			protocolVersion: "2025-11-25",
			capabilities: {},
			clientInfo: { name: "vitest", version: "0.0.0" },
		},
	});
	const initResult = await rpcResult<{ serverInfo: { name: string } }>(init);
	expect(initResult.serverInfo.name).toBe("toxil");
	// Stateless: no session id is issued.
	expect(init.headers.get("mcp-session-id")).toBeNull();

	// initialized notification
	const notified = await rpc(token, {
		jsonrpc: "2.0",
		method: "notifications/initialized",
	});
	expect(notified.status).toBe(202);

	// tools/list
	const toolsRes = await rpc(token, {
		jsonrpc: "2.0",
		id: 2,
		method: "tools/list",
	});
	const tools = await rpcResult<{ tools: Array<{ name: string }> }>(toolsRes);
	expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
		"list_entries",
		"list_projects",
		"list_workspaces",
		"log_work",
		"update_entry",
	]);

	// tools/call log_work → entry persisted via the REST API loopback
	const callRes = await rpc(token, {
		jsonrpc: "2.0",
		id: 3,
		method: "tools/call",
		params: {
			name: "log_work",
			arguments: {
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 25,
				description: "Logged via MCP",
				tags: ["mcp"],
			},
		},
	});
	const call = await rpcResult<{
		content: Array<{ type: string; text: string }>;
		isError?: boolean;
	}>(callRes);
	expect(call.isError).toBeFalsy();
	const entry = JSON.parse(call.content[0]?.text ?? "{}") as {
		id: string;
		entryDate: string;
	};
	expect(entry.entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

	const listed = (await (
		await apiGet(`/api/v1/work-entries?workspaceId=${ws.id}`, cookie)
	).json()) as Array<{ id: string; description: string }>;
	expect(
		listed.some((e) => e.id === entry.id && e.description === "Logged via MCP"),
	).toBe(true);
});

it("surfaces scope errors as tool errors", async () => {
	const { ws, project, cookie } = await setup();
	const readToken = (
		(await (
			await apiJson(
				"POST",
				"/api/v1/tokens",
				{ name: "ro", scopes: ["read"] },
				cookie,
			)
		).json()) as { token: string }
	).token;

	const callRes = await rpc(readToken, {
		jsonrpc: "2.0",
		id: 4,
		method: "tools/call",
		params: {
			name: "log_work",
			arguments: {
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 5,
				description: "should fail",
			},
		},
	});
	const call = await rpcResult<{
		content: Array<{ type: string; text: string }>;
		isError?: boolean;
	}>(callRes);
	expect(call.isError).toBe(true);
	expect(call.content[0]?.text).toContain("insufficient_scope");
});
