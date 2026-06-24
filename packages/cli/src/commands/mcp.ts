import { parseArgs } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SpantailClient } from "@spantail/sdk";
import { registerSpantailTools } from "@spantail/sdk/mcp";

import { resolveConnection } from "../client";
import type { CliContext } from "../context";
import { CliError } from "../errors";
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
	registerSpantailTools(
		server,
		new SpantailClient({
			baseUrl: connection.baseUrl,
			token: connection.token,
			client: "mcp",
		}),
	);
	await server.connect(new StdioServerTransport());
	return 0;
}
