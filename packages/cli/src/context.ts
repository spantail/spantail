import type { Prompter } from "./prompt";

export interface Writer {
	write(text: string): void;
}

/** Everything a command reads from the process, injectable for tests. */
export interface CliContext {
	env: Record<string, string | undefined>;
	stdout: Writer;
	stderr: Writer;
	prompter: Prompter;
	/** Directory holding config.json. */
	configDir: string;
	/** Custom fetch handed to the API client (tests inject a stub). */
	fetch?: typeof fetch;
}
