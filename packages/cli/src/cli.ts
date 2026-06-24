import { SpantailApiError } from "@spantail/sdk";

import { authLogin, authLogout, authStatus } from "./commands/auth";
import { logCommand } from "./commands/log";
import { mcpCommand } from "./commands/mcp";
import { projectsList } from "./commands/projects";
import { reportList, reportView } from "./commands/report";
import { spansList } from "./commands/spans";
import { workspacesList } from "./commands/workspaces";
import type { CliContext } from "./context";
import { CliError, isParseArgsError, UsageError } from "./errors";
import { VERSION } from "./version";

type CommandHandler = (args: string[], ctx: CliContext) => Promise<number>;

const commands: Record<
	string,
	CommandHandler | Record<string, CommandHandler>
> = {
	auth: { login: authLogin, status: authStatus, logout: authLogout },
	workspaces: { list: workspacesList },
	projects: { list: projectsList },
	log: logCommand,
	spans: { list: spansList },
	report: { list: reportList, view: reportView },
	mcp: mcpCommand,
};

const USAGE = `spantail ${VERSION} — work logging for the command line

Usage: spantail <command> [options]

Commands:
  auth login        Save credentials for a Spantail instance
  auth status       Show the active connection and signed-in user
  auth logout       Remove saved credentials
  workspaces list   List the workspaces you belong to
  projects list     List the projects in a workspace
  log               Log a work span
  spans list      List recent work spans
  report list       List your reports
  report view       Print a report's rendered markdown
  mcp               Run a stdio MCP server bridging AI clients to a Spantail instance

Run \`spantail <command> --help\` for command options.
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
	const span = commands[first];
	if (span === undefined) {
		ctx.stderr.write(USAGE);
		ctx.stderr.write(`\nspantail: unknown command "${first}"\n`);
		return 2;
	}
	if (typeof span === "function") return invoke(first, span, rest, ctx);

	const [second, ...subRest] = rest;
	const handler = second === undefined ? undefined : span[second];
	if (handler === undefined) {
		const expected = `spantail ${first} <${Object.keys(span).join("|")}>`;
		ctx.stderr.write(
			second === undefined
				? `spantail: usage: ${expected}\n`
				: `spantail: unknown command "${first} ${second}"; usage: ${expected}\n`,
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
				`${error.message}\nRun \`spantail ${name} --help\` for usage.`,
			);
		}
		throw error;
	}
}

function formatError(error: unknown): string {
	if (error instanceof SpantailApiError) {
		const lines = [`spantail: ${error.message}`];
		if (error.status === 401) {
			lines.push(
				"hint: run `spantail auth login` (or check SPANTAIL_API_TOKEN)",
			);
		} else if (error.code === "insufficient_scope") {
			lines.push(
				"hint: the API token is missing a scope; create one with read and write scopes in the web UI",
			);
		}
		return `${lines.join("\n")}\n`;
	}
	const message = error instanceof Error ? error.message : String(error);
	return `spantail: ${message}\n`;
}
