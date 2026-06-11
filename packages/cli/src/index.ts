#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ToxilClient } from "@toxil/sdk";
import { registerToxilTools } from "@toxil/sdk/mcp";

const VERSION = "0.1.0";

const USAGE = `toxil ${VERSION}

Usage: toxil <command>

Commands:
  mcp   Run a stdio MCP server bridging AI clients to a Toxil instance.
        Requires the TOXIL_API_URL and TOXIL_API_TOKEN environment variables.
`;

async function runMcp(): Promise<void> {
	const baseUrl = process.env.TOXIL_API_URL;
	const token = process.env.TOXIL_API_TOKEN;
	if (!baseUrl || !token) {
		process.stderr.write(
			"toxil mcp: TOXIL_API_URL and TOXIL_API_TOKEN must be set\n",
		);
		process.exit(1);
	}

	const server = new McpServer({ name: "toxil", version: VERSION });
	registerToxilTools(server, new ToxilClient({ baseUrl, token }));
	await server.connect(new StdioServerTransport());
}

async function main(): Promise<void> {
	const [command] = process.argv.slice(2);
	if (command === "mcp") {
		await runMcp();
		return;
	}
	process.stderr.write(USAGE);
	process.exit(command === undefined || command === "--help" ? 0 : 1);
}

main().catch((error) => {
	process.stderr.write(
		`toxil: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(1);
});
