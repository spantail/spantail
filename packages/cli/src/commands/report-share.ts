import { parseArgs } from "node:util";

import { shareStatus } from "@spantail/core";

import { createClient, requireConnection } from "../client";
import { confirmAction } from "../confirm";
import type { CliContext } from "../context";
import { UsageError } from "../errors";
import { formatTable } from "../output";

function shareUrl(baseUrl: string, token: string): string {
	return `${baseUrl.replace(/\/$/, "")}/share/${token}`;
}

const SHARE_USAGE = `Usage: spantail report share <id> [options]

Creates a public share link for a report and prints its URL. Anyone with the
URL can read the report, so share it deliberately.

Options:
  --expires-in <days>  Days until the link expires, 1-365 (default: no expiry)
  --passcode <secret>  Require this passcode to open the link (4-128 chars).
                       Note: the value lands in your shell history; prefer an
                       interactive shell with a leading space, or rotate it.
  -h, --help           Show this help
`;

export async function reportShare(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			"expires-in": { type: "string" },
			passcode: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(SHARE_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single report <id>");
	}
	let expiresInDays: number | undefined;
	if (values["expires-in"] !== undefined) {
		expiresInDays = Number(values["expires-in"]);
		if (
			!Number.isInteger(expiresInDays) ||
			expiresInDays < 1 ||
			expiresInDays > 365
		) {
			throw new UsageError(
				`invalid --expires-in "${values["expires-in"]}"; use an integer between 1 and 365`,
			);
		}
	}

	const connection = requireConnection(ctx);
	const client = createClient(ctx, connection);
	const share = await client.createReportShare(id, {
		expiresInDays,
		passcode: values.passcode,
	});
	// Only the URL goes to stdout so scripts can capture it directly.
	ctx.stdout.write(`${shareUrl(connection.baseUrl, share.token)}\n`);
	const expiry = share.expiresAt ? `expires ${share.expiresAt}` : "no expiry";
	const passcode = share.hasPasscode ? "passcode required" : "no passcode";
	ctx.stderr.write(`Share ${share.id}: ${expiry}, ${passcode}\n`);
	return 0;
}

const SHARES_USAGE = `Usage: spantail report shares <id>

Lists a report's share links. The SHARE ID column is the input to
\`spantail report unshare\`.
`;

export async function reportShares(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(SHARES_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single report <id>");
	}

	const connection = requireConnection(ctx);
	const client = createClient(ctx, connection);
	const shares = await client.listReportShares(id);
	if (shares.length === 0) {
		ctx.stderr.write("No share links.\n");
		return 0;
	}
	ctx.stdout.write(
		`${formatTable(
			["SHARE ID", "URL", "STATUS", "PASSCODE", "EXPIRES", "VIEWS"],
			shares.map((share) => [
				share.id,
				shareUrl(connection.baseUrl, share.token),
				shareStatus(share),
				share.hasPasscode ? "yes" : "",
				share.expiresAt ?? "",
				String(share.viewCount),
			]),
		)}\n`,
	);
	return 0;
}

const UNSHARE_USAGE = `Usage: spantail report unshare <share-id> [options]

Revokes a share link so its URL stops working. Takes a share id (from
\`spantail report shares\`), not a report id. Asks for confirmation unless
--yes is passed; a non-interactive session requires --yes.

Options:
  --yes        Skip the confirmation prompt
  -h, --help   Show this help
`;

export async function reportUnshare(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			yes: { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(UNSHARE_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single <share-id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const confirmed = await confirmAction(
		ctx,
		`Revoke share link ${id}?`,
		values.yes,
	);
	if (!confirmed) {
		ctx.stderr.write("Cancelled.\n");
		return 1;
	}
	await client.revokeReportShare(id);
	ctx.stdout.write(`Revoked share ${id}\n`);
	return 0;
}
