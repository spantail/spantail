import { parseArgs } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ToxilClient } from "@toxil/sdk";
import { registerToxilTools } from "@toxil/sdk/mcp";

import type { CliContext } from "../context";
import { CliError } from "../errors";
import { VERSION } from "../version";

const USAGE = `Usage: toxil mcp

Runs a stdio MCP server bridging AI clients to a Toxil instance.
Requires the TOXIL_API_URL and TOXIL_API_TOKEN environment variables.
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

	const baseUrl = ctx.env.TOXIL_API_URL;
	const token = ctx.env.TOXIL_API_TOKEN;
	if (!baseUrl || !token) {
		throw new CliError("TOXIL_API_URL and TOXIL_API_TOKEN must be set");
	}

	const server = new McpServer({ name: "toxil", version: VERSION });
	registerToxilTools(server, new ToxilClient({ baseUrl, token }));
	await server.connect(new StdioServerTransport());
	return 0;
}
