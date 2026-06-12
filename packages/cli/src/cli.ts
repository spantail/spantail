import { ToxilApiError } from "@toxil/sdk";

import { mcpCommand } from "./commands/mcp";
import type { CliContext } from "./context";
import { CliError, isParseArgsError, UsageError } from "./errors";
import { VERSION } from "./version";

type CommandHandler = (args: string[], ctx: CliContext) => Promise<number>;

const commands: Record<
	string,
	CommandHandler | Record<string, CommandHandler>
> = {
	mcp: mcpCommand,
};

const USAGE = `toxil ${VERSION} — work logging for the command line

Usage: toxil <command> [options]

Commands:
  mcp   Run a stdio MCP server bridging AI clients to a Toxil instance

Run \`toxil <command> --help\` for command options.
`;

export async function runCli(argv: string[], ctx: CliContext): Promise<number> {
	try {
		return await dispatch(argv, ctx);
	} catch (error) {
		ctx.stderr.write(formatError(error));
		return error instanceof CliError ? error.exitCode : 1;
	}
}

async function dispatch(argv: string[], ctx: CliContext): Promise<number> {
	const [first, ...rest] = argv;
	if (first === undefined || first === "--help" || first === "-h") {
		ctx.stdout.write(USAGE);
		return 0;
	}
	if (first === "--version" || first === "-V") {
		ctx.stdout.write(`${VERSION}\n`);
		return 0;
	}
	const entry = commands[first];
	if (entry === undefined) {
		ctx.stderr.write(USAGE);
		ctx.stderr.write(`\ntoxil: unknown command "${first}"\n`);
		return 2;
	}
	if (typeof entry === "function") return invoke(first, entry, rest, ctx);

	const [second, ...subRest] = rest;
	const handler = second === undefined ? undefined : entry[second];
	if (handler === undefined) {
		const expected = `toxil ${first} <${Object.keys(entry).join("|")}>`;
		ctx.stderr.write(
			second === undefined
				? `toxil: usage: ${expected}\n`
				: `toxil: unknown command "${first} ${second}"; usage: ${expected}\n`,
		);
		return 2;
	}
	return invoke(`${first} ${second}`, handler, subRest, ctx);
}

async function invoke(
	name: string,
	handler: CommandHandler,
	args: string[],
	ctx: CliContext,
): Promise<number> {
	try {
		return await handler(args, ctx);
	} catch (error) {
		if (isParseArgsError(error)) {
			throw new UsageError(
				`${error.message}\nRun \`toxil ${name} --help\` for usage.`,
			);
		}
		throw error;
	}
}

function formatError(error: unknown): string {
	if (error instanceof ToxilApiError) {
		const lines = [`toxil: ${error.message}`];
		if (error.status === 401) {
			lines.push("hint: run `toxil auth login` (or check TOXIL_API_TOKEN)");
		} else if (error.code === "insufficient_scope") {
			lines.push(
				"hint: the API token is missing a scope; create one with read and write scopes in the web UI",
			);
		}
		return `${lines.join("\n")}\n`;
	}
	const message = error instanceof Error ? error.message : String(error);
	return `toxil: ${message}\n`;
}
