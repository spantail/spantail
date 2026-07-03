import { parseArgs } from "node:util";

import type { MailFolder, SetMailFlagsInput } from "@spantail/core";
import { mailFolderSchema } from "@spantail/core";

import { createClient, requireConnection } from "../client";
import type { CliContext } from "../context";
import { UsageError } from "../errors";
import { formatTable, truncate } from "../output";

const FOLDERS = mailFolderSchema.options.join("|");

const LIST_USAGE = `Usage: spantail inbox list [options]

Lists a mailbox folder. The ID column is the input to \`spantail inbox view\`,
\`read\`, and \`unread\`; in the sent folder the BATCH column is the input to
\`spantail inbox flag --sent\`.

Options:
  --folder <name>  Folder: ${FOLDERS} (default: inbox)
  --limit <n>      Maximum items to show (default: all, max: 200)
  -h, --help       Show this help
`;

export async function inboxList(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			folder: { type: "string" },
			limit: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		ctx.stdout.write(LIST_USAGE);
		return 0;
	}
	let folder: MailFolder = "inbox";
	if (values.folder !== undefined) {
		const parsed = mailFolderSchema.safeParse(values.folder);
		if (!parsed.success) {
			throw new UsageError(
				`invalid --folder "${values.folder}"; use one of: ${FOLDERS}`,
			);
		}
		folder = parsed.data;
	}
	let limit: number | undefined;
	if (values.limit !== undefined) {
		limit = Number(values.limit);
		if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
			throw new UsageError(
				`invalid --limit "${values.limit}"; use an integer between 1 and 200`,
			);
		}
	}

	const client = createClient(ctx, requireConnection(ctx));
	const items = await client.listInbox(folder, { limit });
	if (items.length === 0) {
		ctx.stderr.write(`No items in ${folder}.\n`);
		return 0;
	}

	const sent = folder === "sent";
	const headers = sent
		? ["ID", "BATCH", "TO", "REPORT", "RANGE", "DATE"]
		: ["ID", "STATUS", "FROM", "REPORT", "RANGE", "DATE"];
	ctx.stdout.write(
		`${formatTable(
			headers,
			items.map((item) => [
				item.id,
				...(sent
					? [item.batchId, truncate(item.recipientNames.join(", "), 30)]
					: [item.readAt ? "" : "unread", item.senderName]),
				truncate(item.reportName, 40),
				`${item.dateFrom}..${item.dateTo}`,
				item.createdAt,
			]),
		)}\n`,
	);
	return 0;
}

const VIEW_USAGE = `Usage: spantail inbox view <id>

Prints a mailbox item's frozen report snapshot to stdout. Does not change the
read state; use \`spantail inbox read\` for that.
`;

export async function inboxView(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(VIEW_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single item <id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const item = await client.getInboxMessage(id);

	// Only the markdown goes to stdout so redirection captures a clean file.
	ctx.stdout.write(item.renderedMarkdown);
	if (!item.renderedMarkdown.endsWith("\n")) ctx.stdout.write("\n");
	const counterpart =
		item.scope === "sent"
			? `To: ${item.recipients.map((recipient) => recipient.name).join(", ")}`
			: `From: ${item.senderName}`;
	ctx.stderr.write(
		`${item.reportName} (${item.dateFrom} – ${item.dateTo}), ${counterpart}\n`,
	);
	if (item.message) ctx.stderr.write(`Message: ${item.message}\n`);
	return 0;
}

const COUNTS_USAGE = `Usage: spantail inbox counts

Shows per-folder mailbox counts; UNREAD counts unread items in the inbox.
`;

export async function inboxCounts(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
	});
	if (values.help) {
		ctx.stdout.write(COUNTS_USAGE);
		return 0;
	}

	const client = createClient(ctx, requireConnection(ctx));
	const counts = await client.getMailboxCounts();
	ctx.stdout.write(
		`${formatTable(
			["FOLDER", "COUNT"],
			[
				["inbox", String(counts.inbox)],
				["unread", String(counts.unread)],
				["starred", String(counts.starred)],
				["sent", String(counts.sent)],
				["archive", String(counts.archive)],
				["trash", String(counts.trash)],
			],
		)}\n`,
	);
	return 0;
}

const READ_USAGE = `Usage: spantail inbox read <id>

Marks a received item as read.
`;

const UNREAD_USAGE = `Usage: spantail inbox unread <id>

Marks a received item as unread.
`;

async function markReadState(
	args: string[],
	ctx: CliContext,
	mode: "read" | "unread",
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(mode === "read" ? READ_USAGE : UNREAD_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single item <id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	if (mode === "read") await client.markInboxRead(id);
	else await client.markInboxUnread(id);
	ctx.stdout.write(`Marked ${id} ${mode}\n`);
	return 0;
}

export function inboxRead(args: string[], ctx: CliContext): Promise<number> {
	return markReadState(args, ctx, "read");
}

export function inboxUnread(args: string[], ctx: CliContext): Promise<number> {
	return markReadState(args, ctx, "unread");
}

const READ_ALL_USAGE = `Usage: spantail inbox read-all

Marks every unread inbox item as read.
`;

export async function inboxReadAll(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
	});
	if (values.help) {
		ctx.stdout.write(READ_ALL_USAGE);
		return 0;
	}

	const client = createClient(ctx, requireConnection(ctx));
	await client.markAllInboxRead();
	ctx.stdout.write("Marked all read\n");
	return 0;
}

const FLAG_USAGE = `Usage: spantail inbox flag <id> [options]

Toggles your flags on a mailbox item. Received items are flagged by their ID;
sent batches by their BATCH id with --sent (both shown by \`spantail inbox list\`).

Options:
  --sent                     Flag a sent batch instead of a received item
  --star / --unstar          Set or clear the star
  --archive / --unarchive    Move to or out of the archive
  --trash / --untrash        Move to or out of the trash
  -h, --help                 Show this help
`;

export async function inboxFlag(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			sent: { type: "boolean" },
			star: { type: "boolean" },
			unstar: { type: "boolean" },
			archive: { type: "boolean" },
			unarchive: { type: "boolean" },
			trash: { type: "boolean" },
			untrash: { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(FLAG_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single item <id>");
	}

	const pairs = [
		["star", "unstar", "starred"],
		["archive", "unarchive", "archived"],
		["trash", "untrash", "trashed"],
	] as const;
	const input: SetMailFlagsInput = {
		scope: values.sent ? "sent" : "received",
		targetId: id,
	};
	for (const [on, off, field] of pairs) {
		if (values[on] && values[off]) {
			throw new UsageError(`--${on} and --${off} are mutually exclusive`);
		}
		if (values[on]) input[field] = true;
		if (values[off]) input[field] = false;
	}
	if (
		input.starred === undefined &&
		input.archived === undefined &&
		input.trashed === undefined
	) {
		throw new UsageError(
			"pass at least one flag: --star/--unstar, --archive/--unarchive, --trash/--untrash",
		);
	}

	const client = createClient(ctx, requireConnection(ctx));
	await client.setMailFlags(input);
	ctx.stdout.write(`Updated flags on ${id}\n`);
	return 0;
}
