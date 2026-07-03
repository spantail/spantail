import { SpantailApiError } from "@spantail/sdk";

import { authLogin, authLogout, authStatus } from "./commands/auth";
import {
	entriesDelete,
	entriesEdit,
	entriesList,
	entriesStats,
	entriesTags,
	entriesView,
} from "./commands/entries";
import {
	inboxCounts,
	inboxFlag,
	inboxList,
	inboxRead,
	inboxReadAll,
	inboxUnread,
	inboxView,
} from "./commands/inbox";
import { logCommand } from "./commands/log";
import { mcpCommand } from "./commands/mcp";
import { projectsList } from "./commands/projects";
import {
	reportCreate,
	reportDelete,
	reportEdit,
	reportList,
	reportPreview,
	reportTemplates,
	reportView,
} from "./commands/report";
import {
	reportComment,
	reportDiscussion,
	reportReact,
} from "./commands/report-discussion";
import {
	reportRecipients,
	reportSend,
	reportSends,
} from "./commands/report-send";
import {
	reportShare,
	reportShares,
	reportUnshare,
} from "./commands/report-share";
import { searchCommand } from "./commands/search";
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
	entries: {
		list: entriesList,
		view: entriesView,
		edit: entriesEdit,
		delete: entriesDelete,
		stats: entriesStats,
		tags: entriesTags,
	},
	report: {
		list: reportList,
		view: reportView,
		create: reportCreate,
		preview: reportPreview,
		edit: reportEdit,
		delete: reportDelete,
		templates: reportTemplates,
		recipients: reportRecipients,
		send: reportSend,
		sends: reportSends,
		share: reportShare,
		shares: reportShares,
		unshare: reportUnshare,
		discussion: reportDiscussion,
		comment: reportComment,
		react: reportReact,
	},
	inbox: {
		list: inboxList,
		view: inboxView,
		counts: inboxCounts,
		read: inboxRead,
		unread: inboxUnread,
		"read-all": inboxReadAll,
		flag: inboxFlag,
	},
	search: searchCommand,
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
  log               Log a work entry
  entries list      List recent work entries
  entries view      Print one work entry in full
  entries edit      Update fields of a work entry
  entries delete    Delete a work entry
  entries stats     Show aggregated work-entry stats
  entries tags      List the distinct tags in scope
  report list       List your reports
  report view       Print a report's rendered markdown
  report create     Create a report from a template and filters
  report preview    Render a report without saving it
  report edit       Re-render a report with changed fields
  report delete     Delete a report
  report templates  List the instance's report templates
  report recipients List a report's candidate recipients
  report send       Send a report to recipients' inboxes
  report sends      Show a report's send history
  report share      Create a public share link for a report
  report shares     List a report's share links
  report unshare    Revoke a share link
  report discussion Show a report's reactions and comments
  report comment    Add, edit, or delete a comment on a report
  report react      Toggle a reaction on a report or comment
  inbox list        List a mailbox folder
  inbox view        Print a mailbox item's frozen report snapshot
  inbox counts      Show per-folder mailbox counts
  inbox read        Mark an item read
  inbox unread      Mark an item unread
  inbox read-all    Mark every unread inbox item read
  inbox flag        Toggle star/archive/trash flags on an item
  search            Search your work entries and reports
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
	const entry = commands[first];
	if (entry === undefined) {
		ctx.stderr.write(USAGE);
		ctx.stderr.write(`\nspantail: unknown command "${first}"\n`);
		return 2;
	}
	if (typeof entry === "function") return invoke(first, entry, rest, ctx);

	const [second, ...subRest] = rest;
	const handler = second === undefined ? undefined : entry[second];
	if (handler === undefined) {
		const expected = `spantail ${first} <${Object.keys(entry).join("|")}>`;
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
