import { parseArgs } from "node:util";

import type { ReactionEmoji, ReactionSummary } from "@spantail/core";
import { reactionEmojiSchema } from "@spantail/core";

import { createClient, requireConnection } from "../client";
import { confirmAction } from "../confirm";
import type { CliContext } from "../context";
import { UsageError } from "../errors";

/**
 * CLI spellings of the reaction emoji. `-1` cannot be typed as a positional
 * (parseArgs reads it as an option), so both thumbs get word aliases.
 */
const EMOJI_ALIASES: Record<string, ReactionEmoji> = {
	"thumbs-up": "+1",
	"thumbs-down": "-1",
};

const EMOJI_HELP = [
	...reactionEmojiSchema.options.filter((emoji) => emoji !== "-1"),
	...Object.keys(EMOJI_ALIASES),
].join(", ");

function formatReactions(reactions: ReactionSummary[]): string {
	return reactions
		.map(
			(reaction) =>
				`${reaction.emoji} x${reaction.count} (${reaction.userNames.join(", ")})`,
		)
		.join("  ");
}

const DISCUSSION_USAGE = `Usage: spantail report discussion <id>

Shows a report's discussion: body reactions and comments. The comment ids
are inputs to \`spantail report comment --edit/--delete\` and
\`spantail report react --comment\`.
`;

export async function reportDiscussion(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(DISCUSSION_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single report <id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const discussion = await client.getReportDiscussion(id);
	if (discussion.reactions.length === 0 && discussion.comments.length === 0) {
		ctx.stderr.write(
			discussion.shared
				? "No comments or reactions yet.\n"
				: "No discussion: the report has not been sent to anyone.\n",
		);
		return 0;
	}

	if (discussion.reactions.length > 0) {
		ctx.stdout.write(`Reactions: ${formatReactions(discussion.reactions)}\n`);
	}
	for (const comment of discussion.comments) {
		const edited =
			comment.updatedAt !== comment.createdAt ? " (edited)" : "";
		ctx.stdout.write(
			`\n${comment.id}  ${comment.authorName}  ${comment.createdAt}${edited}\n`,
		);
		ctx.stdout.write(`${comment.body}\n`);
		if (comment.reactions.length > 0) {
			ctx.stdout.write(`  reactions: ${formatReactions(comment.reactions)}\n`);
		}
	}
	return 0;
}

const COMMENT_USAGE = `Usage: spantail report comment <report-id> <body>
       spantail report comment <report-id> --edit <comment-id> <new-body>
       spantail report comment <report-id> --delete <comment-id> [--yes]

Adds, edits, or deletes a comment on a report's discussion. You can only
edit or delete your own comments.

Options:
  --edit <comment-id>    Replace the body of one of your comments
  --delete <comment-id>  Delete one of your comments
  --yes                  Skip the delete confirmation prompt
  -h, --help             Show this help
`;

export async function reportComment(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			edit: { type: "string" },
			delete: { type: "string" },
			yes: { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(COMMENT_USAGE);
		return 0;
	}
	if (values.edit && values.delete) {
		throw new UsageError("--edit and --delete are mutually exclusive");
	}
	const reportId = positionals[0];
	if (reportId === undefined) {
		throw new UsageError("expected a <report-id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	if (values.delete) {
		if (positionals.length > 1) {
			throw new UsageError("--delete takes no <body>");
		}
		const confirmed = await confirmAction(
			ctx,
			`Delete comment ${values.delete}?`,
			values.yes,
		);
		if (!confirmed) {
			ctx.stderr.write("Cancelled.\n");
			return 1;
		}
		await client.deleteReportComment(reportId, values.delete);
		ctx.stdout.write(`Deleted comment ${values.delete}\n`);
		return 0;
	}

	const body = positionals[1];
	if (body === undefined || positionals.length > 2) {
		throw new UsageError(
			"expected a single <body>; quote it if it contains spaces",
		);
	}
	if (values.edit) {
		const comment = await client.updateReportComment(
			reportId,
			values.edit,
			body,
		);
		ctx.stdout.write(`Updated comment ${comment.id}\n`);
		return 0;
	}
	const comment = await client.addReportComment(reportId, body);
	ctx.stdout.write(`Added comment ${comment.id}\n`);
	return 0;
}

const REACT_USAGE = `Usage: spantail report react <report-id> <emoji> [options]

Toggles your reaction on a report (or on one of its comments): reacting
twice with the same emoji removes it.

<emoji> is one of: ${EMOJI_HELP}
(thumbs-down stands for -1, which cannot be typed as an argument)

Options:
  --comment <comment-id>  React to this comment instead of the report body
  -h, --help              Show this help
`;

export async function reportReact(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			comment: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(REACT_USAGE);
		return 0;
	}
	const reportId = positionals[0];
	const emojiArg = positionals[1];
	if (reportId === undefined || emojiArg === undefined || positionals.length > 2) {
		throw new UsageError("expected a <report-id> and an <emoji>");
	}
	const emoji =
		EMOJI_ALIASES[emojiArg] ??
		reactionEmojiSchema.safeParse(emojiArg).data;
	if (emoji === undefined) {
		throw new UsageError(
			`invalid emoji "${emojiArg}"; use one of: ${EMOJI_HELP}`,
		);
	}

	const client = createClient(ctx, requireConnection(ctx));
	const reactions = values.comment
		? await client.toggleReportCommentReaction(reportId, values.comment, emoji)
		: await client.toggleReportReaction(reportId, emoji);
	const mine = reactions.find(
		(reaction) => reaction.emoji === emoji && reaction.reactedByMe,
	);
	ctx.stdout.write(
		mine ? `Added ${emoji} (now x${mine.count})\n` : `Removed ${emoji}\n`,
	);
	if (reactions.length > 0) {
		ctx.stderr.write(`Reactions: ${formatReactions(reactions)}\n`);
	}
	return 0;
}
