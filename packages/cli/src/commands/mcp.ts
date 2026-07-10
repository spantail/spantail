import { parseArgs } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSpantailTools } from "@spantail/sdk/mcp";

import { createClient, resolveConnection } from "../client";
import type { CliContext } from "../context";
import { CliError } from "../errors";
import { registerStdioTools } from "../mcp-tools";
import { VERSION } from "../version";

const USAGE = `Usage: spantail mcp

Runs a stdio MCP server bridging AI clients to a Spantail instance.
Credentials come from the SPANTAIL_API_URL and SPANTAIL_API_TOKEN environment
variables, or from the config file written by \`spantail auth login\`.
`;

export async function mcpCommand(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
	});
	if (values.help) {
		ctx.stdout.write(USAGE);
		return 0;
	}

	const connection = resolveConnection(ctx);
	if (!connection) {
		throw new CliError(
			"no credentials; set SPANTAIL_API_URL and SPANTAIL_API_TOKEN, or run `spantail auth login`",
		);
	}

	const server = new McpServer({ name: "spantail", version: VERSION });
	// Same client the commands use: an unreachable server reads as such, and an
	// out-of-date one warns. Both write to stderr — stdout carries MCP frames.
	const client = createClient(ctx, { ...connection, client: "mcp" });
	registerSpantailTools(server, client);
	// File-based tools exist only here: the remote /mcp Worker has no filesystem.
	registerStdioTools(server, client);
	await server.connect(new StdioServerTransport());
	return 0;
}
