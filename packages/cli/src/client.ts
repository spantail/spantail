import { ToxilClient } from "@toxil/sdk";

import { loadConfig } from "./config";
import type { CliContext } from "./context";
import { CliError } from "./errors";

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
	const envUrl = ctx.env.TOXIL_API_URL;
	const envToken = ctx.env.TOXIL_API_TOKEN;
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
			"not logged in; run `toxil auth login`, or set TOXIL_API_URL and TOXIL_API_TOKEN",
		);
	}
	return connection;
}

export function createClient(
	ctx: CliContext,
	options: { baseUrl: string; token: string },
): ToxilClient {
	const inner =
		ctx.fetch ??
		((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
	// Translate network-level failures (DNS, connection refused) into a
	// user-facing message naming the server.
	const wrapped = (async (input, init) => {
		try {
			return await inner(input, init);
		} catch (error) {
			const detail =
				error instanceof Error
					? error.cause instanceof Error
						? error.cause.message
						: error.message
					: String(error);
			throw new CliError(`could not reach ${options.baseUrl} (${detail})`);
		}
	}) as typeof fetch;
	return new ToxilClient({
		baseUrl: options.baseUrl,
		token: options.token,
		fetch: wrapped,
		client: "cli",
	});
}
