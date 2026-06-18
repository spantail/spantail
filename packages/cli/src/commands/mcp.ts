import { parseArgs } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ToxilClient } from "@toxil/sdk";
import { registerToxilTools } from "@toxil/sdk/mcp";

import { resolveConnection } from "../client";
import type { CliContext } from "../context";
import { CliError } from "../errors";
import { VERSION } from "../version";

const USAGE = `Usage: toxil mcp

Runs a stdio MCP server bridging AI clients to a Toxil instance.
Credentials come from the TOXIL_API_URL and TOXIL_API_TOKEN environment
variables, or from the config file written by \`toxil auth login\`.
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
			"no credentials; set TOXIL_API_URL and TOXIL_API_TOKEN, or run `toxil auth login`",
		);
	}

	const server = new McpServer({ name: "toxil", version: VERSION });
	registerToxilTools(
		server,
		new ToxilClient({
			baseUrl: connection.baseUrl,
			token: connection.token,
			client: "mcp",
		}),
	);
	await server.connect(new StdioServerTransport());
	return 0;
}
