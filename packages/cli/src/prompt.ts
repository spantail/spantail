import readline from "node:readline/promises";
import { Writable } from "node:stream";

export interface Prompter {
	/** Whether interactive prompts are possible (TTY on stdin and stderr). */
	readonly interactive: boolean;
	ask(question: string): Promise<string>;
	/** Asks without echoing the typed characters (for secrets). */
	askHidden(question: string): Promise<string>;
}

export function createPrompter(): Prompter {
	return {
		interactive: process.stdin.isTTY === true && process.stderr.isTTY === true,
		async ask(question) {
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stderr,
			});
			try {
				return (await rl.question(question)).trim();
			} finally {
				rl.close();
			}
		},
		async askHidden(question) {
			// Echo the question, then mute the stream so keystrokes stay hidden.
			let muted = false;
			const output = new Writable({
				write(chunk, _encoding, callback) {
					if (!muted) process.stderr.write(chunk);
					callback();
				},
			});
			const rl = readline.createInterface({
				input: process.stdin,
				output,
				terminal: true,
			});
			try {
				const pending = rl.question(question);
				muted = true;
				const answer = (await pending).trim();
				process.stderr.write("\n");
				return answer;
			} finally {
				rl.close();
			}
		},
	};
}
