import { parseArgs } from "node:util";

import { isPatFormat, type WorkspaceWithRole } from "@spantail/core";
import { type Me, SpantailApiError } from "@spantail/sdk";

import {
	type ConnectionSource,
	createClient,
	resolveConnection,
} from "../client";
import {
	type CliConfig,
	configPath,
	deleteConfig,
	loadConfig,
	saveConfig,
} from "../config";
import type { CliContext } from "../context";
import { CliError, UsageError } from "../errors";

const LOGIN_USAGE = `Usage: spantail auth login [options]

Saves credentials for a Spantail instance. Create an API token in the web UI
under Account > API tokens — open the user menu in the top-right corner
(read and write scopes recommended).

Options:
  --server <url>       Instance URL, e.g. https://spantail.example.com
  --token <token>      API token (prompted interactively when omitted)
  --workspace <slug>   Default workspace for commands that need one
  -h, --help           Show this help
`;

const STATUS_USAGE = `Usage: spantail auth status

Shows the active connection and the signed-in user. Exits non-zero when no
credentials are configured or the server rejects them.
`;

const LOGOUT_USAGE = `Usage: spantail auth logout

Removes the saved config file. The API token itself stays valid; revoke it
in the web UI under Account > API tokens if needed.
`;

function maskToken(token: string): string {
	// Reveal the type prefix (e.g. `spantail_pat_`, up to the second underscore) and the
	// last 4 chars; hide the random middle. Prefix-length-agnostic by design.
	const sep = token.indexOf("_", token.indexOf("_") + 1);
	return sep !== -1 && token.length > sep + 5
		? `${token.slice(0, sep + 1)}…${token.slice(-4)}`
		: "…";
}

function normalizeServerUrl(input: string): string {
	const trimmed = input.trim().replace(/\/+$/, "");
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new CliError(`invalid server URL "${input}"`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new CliError(`invalid server URL "${input}"; must be http(s)`);
	}
	return trimmed;
}

/** Tolerates a corrupt config file: login overwrites it anyway. */
function loadPreviousConfig(ctx: CliContext): CliConfig | null {
	try {
		return loadConfig(ctx.configDir);
	} catch {
		return null;
	}
}

/**
 * The SDK types /me responses but cannot guarantee them: a non-Spantail server
 * answering 200 with HTML surfaces here as null or an arbitrary object.
 */
function isMeShape(value: unknown): value is Me {
	if (typeof value !== "object" || value === null) return false;
	const me = value as { user?: { email?: unknown }; memberships?: unknown };
	return typeof me.user?.email === "string" && Array.isArray(me.memberships);
}

export async function authLogin(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			server: { type: "string" },
			token: { type: "string" },
			workspace: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		ctx.stdout.write(LOGIN_USAGE);
		return 0;
	}

	if ((!values.server || !values.token) && !ctx.prompter.interactive) {
		throw new UsageError(
			"stdin is not a terminal; provide --server and --token for non-interactive login",
		);
	}

	const previous = loadPreviousConfig(ctx);
	let server = values.server;
	if (!server) {
		const fallback = previous?.baseUrl;
		const answer = await ctx.prompter.ask(
			fallback ? `Server URL [${fallback}]: ` : "Server URL: ",
		);
		server = answer || fallback || "";
	}
	const baseUrl = normalizeServerUrl(server);

	const token = values.token ?? (await ctx.prompter.askHidden("API token: "));
	if (!token) throw new CliError("no token provided");
	if (!isPatFormat(token)) {
		ctx.stderr.write(
			"warning: the token does not look like a Spantail API token (spantail_pat_...)\n",
		);
	}

	const client = createClient(ctx, { baseUrl, token });
	let me: Me;
	try {
		me = await client.me();
	} catch (error) {
		if (error instanceof SpantailApiError) {
			throw new CliError(
				`login failed: ${error.message} (status ${error.status})`,
			);
		}
		throw error;
	}
	if (!isMeShape(me)) {
		throw new CliError(
			`${baseUrl} does not look like a Spantail server; use the instance root URL, e.g. https://spantail.example.com`,
		);
	}

	const defaultWorkspace = await pickDefaultWorkspace(
		ctx,
		values.workspace,
		me.memberships,
	);

	saveConfig(ctx.configDir, {
		baseUrl,
		token,
		...(defaultWorkspace ? { defaultWorkspace } : {}),
	});
	ctx.stdout.write(`Logged in to ${baseUrl} as ${me.user.email}\n`);
	ctx.stdout.write(
		defaultWorkspace
			? `Default workspace: ${defaultWorkspace}\n`
			: "No default workspace set; pass --workspace to commands that need one.\n",
	);
	return 0;
}

async function pickDefaultWorkspace(
	ctx: CliContext,
	flag: string | undefined,
	memberships: WorkspaceWithRole[],
): Promise<string | undefined> {
	if (flag) {
		if (!memberships.some((ws) => ws.slug === flag)) {
			const available = memberships.map((ws) => ws.slug).join(", ") || "none";
			throw new CliError(
				`you are not a member of workspace "${flag}" (available: ${available})`,
			);
		}
		return flag;
	}
	if (memberships.length === 0) {
		ctx.stderr.write("warning: you are not a member of any workspace yet\n");
		return undefined;
	}
	if (memberships.length === 1) return memberships[0]?.slug;
	if (!ctx.prompter.interactive) return undefined;

	ctx.stderr.write("Workspaces:\n");
	memberships.forEach((ws, index) => {
		ctx.stderr.write(`  ${index + 1}. ${ws.slug} — ${ws.name}\n`);
	});
	const answer = await ctx.prompter.ask(
		`Default workspace [1-${memberships.length}, empty to skip]: `,
	);
	if (!answer) return undefined;
	const index = Number(answer);
	const picked = Number.isInteger(index)
		? memberships[index - 1]
		: memberships.find((ws) => ws.slug === answer);
	if (!picked) throw new CliError(`invalid workspace selection "${answer}"`);
	return picked.slug;
}

export async function authStatus(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
	});
	if (values.help) {
		ctx.stdout.write(STATUS_USAGE);
		return 0;
	}

	const connection = resolveConnection(ctx);
	if (!connection) {
		throw new CliError(
			"not logged in; run `spantail auth login`, or set SPANTAIL_API_URL and SPANTAIL_API_TOKEN",
		);
	}
	const describe = (source: ConnectionSource) =>
		source === "env" ? "environment" : configPath(ctx.configDir);
	ctx.stdout.write(
		`Server: ${connection.baseUrl} (${describe(connection.baseUrlSource)})\n`,
	);
	ctx.stdout.write(
		`Token: ${maskToken(connection.token)} (${describe(connection.tokenSource)})\n`,
	);

	const client = createClient(ctx, connection);
	const me = await client.me();
	if (!isMeShape(me)) {
		throw new CliError(
			`${connection.baseUrl} does not look like a Spantail server`,
		);
	}
	ctx.stdout.write(
		`User: ${me.user.name} <${me.user.email}>${me.user.isAdmin ? " (instance admin)" : ""}\n`,
	);
	ctx.stdout.write(
		`Workspaces: ${
			me.memberships.length
				? me.memberships.map((ws) => `${ws.slug} (${ws.role})`).join(", ")
				: "none"
		}\n`,
	);
	const defaultWorkspace = loadPreviousConfig(ctx)?.defaultWorkspace;
	if (defaultWorkspace) {
		const known = me.memberships.some((ws) => ws.slug === defaultWorkspace);
		ctx.stdout.write(
			`Default workspace: ${defaultWorkspace}${known ? "" : " (warning: not in your memberships)"}\n`,
		);
	}
	return 0;
}

export async function authLogout(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
	});
	if (values.help) {
		ctx.stdout.write(LOGOUT_USAGE);
		return 0;
	}

	if (deleteConfig(ctx.configDir)) {
		ctx.stdout.write(`Removed ${configPath(ctx.configDir)}\n`);
		ctx.stdout.write(
			"The API token stays valid; revoke it in the web UI if needed.\n",
		);
	} else {
		ctx.stdout.write("No saved credentials.\n");
	}
	return 0;
}
