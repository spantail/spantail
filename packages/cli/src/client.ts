import { isNewerVersion } from "@spantail/core";
import { SpantailClient } from "@spantail/sdk";

import { loadConfig } from "./config";
import type { CliContext } from "./context";
import { CliError } from "./errors";
import { MIN_SERVER_VERSION } from "./version";

export type ConnectionSource = "env" | "config";

export interface Connection {
	baseUrl: string;
	token: string;
	baseUrlSource: ConnectionSource;
	tokenSource: ConnectionSource;
}

/**
 * Resolves the API connection per field: env vars win, the config file fills
 * the gaps. The file is only read when the env leaves a gap, so a broken
 * config cannot affect fully env-driven setups.
 */
export function resolveConnection(ctx: CliContext): Connection | null {
	const envUrl = ctx.env.SPANTAIL_API_URL;
	const envToken = ctx.env.SPANTAIL_API_TOKEN;
	if (envUrl && envToken) {
		return {
			baseUrl: envUrl,
			token: envToken,
			baseUrlSource: "env",
			tokenSource: "env",
		};
	}
	const config = loadConfig(ctx.configDir);
	const baseUrl = envUrl ?? config?.baseUrl;
	const token = envToken ?? config?.token;
	if (!baseUrl || !token) return null;
	return {
		baseUrl,
		token,
		baseUrlSource: envUrl ? "env" : "config",
		tokenSource: envToken ? "env" : "config",
	};
}

export function requireConnection(ctx: CliContext): Connection {
	const connection = resolveConnection(ctx);
	if (!connection) {
		throw new CliError(
			"not logged in; run `spantail auth login`, or set SPANTAIL_API_URL and SPANTAIL_API_TOKEN",
		);
	}
	return connection;
}

/**
 * Warns once per client when the server is older than the CLI expects. The
 * server stamps every /api response with its version, so this costs no extra
 * request. It only warns: an older server usually still works, and the version
 * is `git describe` output, which reads `unknown` or an off-tag string on
 * clone/fork builds — `isNewerVersion` returns false for those, so they stay
 * silent. Warnings go to stderr because `spantail mcp` speaks MCP on stdout.
 */
function serverVersionWarner(
	ctx: CliContext,
): (version: string | null) => void {
	let warned = false;
	return (version) => {
		if (warned || !version) return;
		if (!isNewerVersion(MIN_SERVER_VERSION, version)) return;
		warned = true;
		ctx.stderr.write(
			`spantail: server ${version} is older than ${MIN_SERVER_VERSION}, the oldest version this CLI is tested against; some commands may fail\n`,
		);
	};
}

export function createClient(
	ctx: CliContext,
	options: { baseUrl: string; token: string; client?: "cli" | "mcp" },
): SpantailClient {
	const inner =
		ctx.fetch ??
		((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
	const warnIfServerIsOld = serverVersionWarner(ctx);
	const wrapped = (async (input, init) => {
		let response: Response;
		// Translate network-level failures (DNS, connection refused) into a
		// user-facing message naming the server. Scoped to the request itself so
		// nothing below is mistaken for one.
		try {
			response = await inner(input, init);
		} catch (error) {
			const detail =
				error instanceof Error
					? error.cause instanceof Error
						? error.cause.message
						: error.message
					: String(error);
			throw new CliError(`could not reach ${options.baseUrl} (${detail})`);
		}
		warnIfServerIsOld(response.headers.get("x-spantail-version"));
		return response;
	}) as typeof fetch;
	return new SpantailClient({
		baseUrl: options.baseUrl,
		token: options.token,
		fetch: wrapped,
		client: options.client ?? "cli",
	});
}
