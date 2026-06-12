/** An error with a user-facing message and a process exit code. */
export class CliError extends Error {
	constructor(
		message: string,
		readonly exitCode = 1,
	) {
		super(message);
		this.name = "CliError";
	}
}

/** Wrong invocation (unknown flags, missing arguments): exit code 2. */
export class UsageError extends CliError {
	constructor(message: string) {
		super(message, 2);
		this.name = "UsageError";
	}
}

export function isParseArgsError(error: unknown): error is Error {
	return (
		error instanceof Error &&
		"code" in error &&
		String(error.code).startsWith("ERR_PARSE_ARGS")
	);
}
