import type { CliContext } from "./context";
import { CliError } from "./errors";

/**
 * Gates a destructive action: `--yes` bypasses the prompt, an interactive
 * session asks `[y/N]`, and a non-interactive session without `--yes` refuses.
 */
export async function confirmAction(
	ctx: CliContext,
	question: string,
	yes: boolean | undefined,
): Promise<boolean> {
	if (yes) return true;
	if (!ctx.prompter.interactive) {
		throw new CliError(
			"confirmation required; pass --yes to proceed in a non-interactive session",
		);
	}
	const answer = (await ctx.prompter.ask(`${question} [y/N] `)).toLowerCase();
	return answer === "y" || answer === "yes";
}
