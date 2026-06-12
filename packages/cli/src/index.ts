#!/usr/bin/env node
import { runCli } from "./cli";
import { resolveConfigDir } from "./config";
import { createPrompter } from "./prompt";

runCli(process.argv.slice(2), {
	env: process.env,
	stdout: process.stdout,
	stderr: process.stderr,
	prompter: createPrompter(),
	configDir: resolveConfigDir(process.env),
}).then(
	(code) => {
		// Set the code and let the event loop drain naturally: a forced
		// process.exit(0) would kill the mcp command's stdio server.
		process.exitCode = code;
	},
	(error: unknown) => {
		process.stderr.write(
			`toxil: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 1;
	},
);
