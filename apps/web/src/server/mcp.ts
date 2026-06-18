import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { hashPat, isPatFormat } from "@toxil/core";
import { createDb, findApiTokenByHash } from "@toxil/db";
import { ToxilClient } from "@toxil/sdk";
import { registerToxilTools } from "@toxil/sdk/mcp";
import { createMcpHandler } from "agents/mcp";
import type { Context, Hono } from "hono";

import type { AppEnv } from "./types";

/**
 * Mounts the remote MCP endpoint. Auth is transport-level here (401 for
 * missing/invalid tokens); authorization stays in the REST middleware because
 * every tool call goes through the API via an in-process loopback fetch with
 * the caller's Authorization header — MCP is a client of the REST API.
 */
export function registerMcpRoute(app: Hono<AppEnv>): void {
	app.all("/mcp", async (c) => {
		const header = c.req.header("authorization");
		const token = header?.startsWith("Bearer ")
			? header.slice("Bearer ".length)
			: undefined;
		if (!token || !isPatFormat(token)) return unauthorized(c);

		const db = createDb(c.env.DB);
		const row = await findApiTokenByHash(db, await hashPat(token));
		if (!row || (row.expiresAt && row.expiresAt.getTime() < Date.now())) {
			return unauthorized(c);
		}

		const client = new ToxilClient({
			baseUrl: new URL(c.req.url).origin,
			token,
			client: "mcp",
			// In-process loopback into this same Worker; no network round trip.
			fetch: async (input, init) =>
				app.fetch(new Request(input, init), c.env, c.executionCtx),
		});
		const server = new McpServer({ name: "toxil", version: "0.1.0" });
		registerToxilTools(server, client);

		// Stateless: no session ids, plain JSON responses.
		const handler = createMcpHandler(server, {
			route: "/mcp",
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});
		// Hono's ExecutionContext interface and the workers-types one differ only
		// in the generic `props` parameter; they are structurally interchangeable.
		return handler(
			c.req.raw,
			c.env,
			c.executionCtx as Parameters<typeof handler>[2],
		);
	});
}

function unauthorized(c: Context<AppEnv>): Response {
	return c.json(
		{
			error: { code: "unauthorized", message: "A valid API token is required" },
		},
		401,
		{ "WWW-Authenticate": 'Bearer realm="toxil"' },
	);
}
