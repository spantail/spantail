import { parseArgs } from "node:util";

import type { ReactionEmoji, ReactionSummary } from "@spantail/core";
import { reactionEmojiSchema } from "@spantail/core";
import { SpantailApiError, type SpantailClient } from "@spantail/sdk";

import { createClient, requireConnection } from "../client";
import { confirmAction } from "../confirm";
import type { CliContext } from "../context";
import { UsageError } from "../errors";

/**
 * Discussion threads are keyed by content version, while the CLI keeps report
 * and mailbox ids as its user-facing arguments. An owner passes a report id
 * (`spantail report list`) and gets the *current* version's thread; a
 * recipient — who cannot read the report itself — passes a mailbox message id
 * (`spantail inbox`) and gets the *delivered* version's thread. Try the
 * report first, then fall back to the mailbox on 404.
 */
async function resolveReportContentId(
	client: SpantailClient,
	id: string,
): Promise<string> {
	try {
		return (await client.getReport(id)).reportContentId;
	} catch (error) {
		if (!(error instanceof SpantailApiError) || error.status !== 404) {
			throw error;
		}
	}
	return (await client.getInboxMessage(id)).reportContentId;
}

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

Shows a discussion: body reactions and comments. Threads are per sent
version, so an edited report starts a new thread. <id> is a report id
(the current version's thread) or, for a recipient, a mailbox message id
from \`spantail inbox\` (the delivered version's thread). The comment ids
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
		throw new UsageError("expected a single <id> (report or mailbox message)");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const contentId = await resolveReportContentId(client, id);
	const discussion = await client.getReportDiscussion(contentId);
	if (discussion.reactions.length === 0 && discussion.comments.length === 0) {
		ctx.stderr.write(
			discussion.shared
				? "No comments or reactions yet.\n"
				: "No discussion: this version has not been sent to anyone.\n",
		);
		return 0;
	}

	if (discussion.reactions.length > 0) {
		ctx.stdout.write(`Reactions: ${formatReactions(discussion.reactions)}\n`);
	}
	for (const comment of discussion.comments) {
		const edited = comment.updatedAt !== comment.createdAt ? " (edited)" : "";
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

const COMMENT_USAGE = `Usage: spantail report comment <id> <body>
       spantail report comment <id> --edit <comment-id> <new-body>
       spantail report comment <id> --delete <comment-id> [--yes]

Adds, edits, or deletes a comment on a discussion. <id> is a report id
(the current version's thread) or, for a recipient, a mailbox message id
from \`spantail inbox\`. You can only edit or delete your own comments.

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
	const id = positionals[0];
	if (id === undefined) {
		throw new UsageError("expected an <id> (report or mailbox message)");
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
		const contentId = await resolveReportContentId(client, id);
		await client.deleteReportComment(contentId, values.delete);
		ctx.stdout.write(`Deleted comment ${values.delete}\n`);
		return 0;
	}

	const body = positionals[1];
	if (body === undefined || positionals.length > 2) {
		throw new UsageError(
			"expected a single <body>; quote it if it contains spaces",
		);
	}
	const contentId = await resolveReportContentId(client, id);
	if (values.edit) {
		const comment = await client.updateReportComment(
			contentId,
			values.edit,
			body,
		);
		ctx.stdout.write(`Updated comment ${comment.id}\n`);
		return 0;
	}
	const comment = await client.addReportComment(contentId, body);
	ctx.stdout.write(`Added comment ${comment.id}\n`);
	return 0;
}

const REACT_USAGE = `Usage: spantail report react <id> <emoji> [options]

Toggles your reaction on a discussion's body (or on one of its comments):
reacting twice with the same emoji removes it. <id> is a report id (the
current version's thread) or, for a recipient, a mailbox message id from
\`spantail inbox\`.

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
	const id = positionals[0];
	const emojiArg = positionals[1];
	if (id === undefined || emojiArg === undefined || positionals.length > 2) {
		throw new UsageError("expected an <id> and an <emoji>");
	}
	const emoji =
		EMOJI_ALIASES[emojiArg] ?? reactionEmojiSchema.safeParse(emojiArg).data;
	if (emoji === undefined) {
		throw new UsageError(
			`invalid emoji "${emojiArg}"; use one of: ${EMOJI_HELP}`,
		);
	}

	const client = createClient(ctx, requireConnection(ctx));
	const contentId = await resolveReportContentId(client, id);
	const reactions = values.comment
		? await client.toggleReportCommentReaction(contentId, values.comment, emoji)
		: await client.toggleReportReaction(contentId, emoji);
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
