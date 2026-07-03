import { parseArgs } from "node:util";

import { createClient, requireConnection } from "../client";
import type { CliContext } from "../context";
import { UsageError } from "../errors";
import { formatTable, truncate } from "../output";
import { resolveRecipients } from "../resolve";

const RECIPIENTS_USAGE = `Usage: spantail report recipients <id>

Lists the candidate recipients of a report: the members of its workspaces,
minus you. The USER ID and EMAIL columns are inputs to \`spantail report send --to\`.
`;

export async function reportRecipients(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(RECIPIENTS_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single report <id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const recipients = await client.listReportRecipients(id);
	if (recipients.length === 0) {
		ctx.stderr.write(
			"No candidate recipients (the report's workspaces have no other members).\n",
		);
		return 0;
	}
	ctx.stdout.write(
		`${formatTable(
			["USER ID", "NAME", "EMAIL"],
			recipients.map((recipient) => [
				recipient.id,
				recipient.name,
				recipient.email,
			]),
		)}\n`,
	);
	return 0;
}

const SEND_USAGE = `Usage: spantail report send <id> [options]

Sends a frozen snapshot of the report to recipients' inboxes. At least one
--to or --self is required.

Options:
  --to <id-or-email>   Recipient; repeat the flag for multiple recipients
                       (see \`spantail report recipients\`)
  --self               Also drop a copy into your own inbox
  --message <text>     Short message shown with the delivery
  -h, --help           Show this help
`;

export async function reportSend(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			to: { type: "string", multiple: true },
			self: { type: "boolean" },
			message: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(SEND_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single report <id>");
	}
	if (!values.to?.length && !values.self) {
		throw new UsageError("pass at least one --to <id-or-email> or --self");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const recipients = values.to?.length
		? await resolveRecipients(client, id, values.to)
		: [];
	const result = await client.sendReport(id, {
		recipientUserIds: recipients.map((recipient) => recipient.id),
		sendToSelf: values.self ?? false,
		message: values.message,
	});
	ctx.stdout.write(`Delivered to ${result.delivered} recipient(s)\n`);
	return 0;
}

const SENDS_USAGE = `Usage: spantail report sends <id>

Shows the report's send history: one row per "Send to" batch.
`;

export async function reportSends(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(SENDS_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single report <id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const sends = await client.listReportSends(id);
	if (sends.length === 0) {
		ctx.stderr.write("No sends yet.\n");
		return 0;
	}
	ctx.stdout.write(
		`${formatTable(
			["DATE", "RECIPIENTS", "READ", "MESSAGE"],
			sends.map((send) => [
				send.createdAt,
				truncate(send.recipientNames.join(", "), 40),
				`${send.readCount}/${send.recipientCount}`,
				truncate(send.message ?? "", 40),
			]),
		)}\n`,
	);
	return 0;
}
