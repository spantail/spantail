import { parseArgs } from "node:util";

import type { Report } from "@toxil/core";
import { ToxilApiError } from "@toxil/sdk";

import { createClient, requireConnection } from "../client";
import type { CliContext } from "../context";
import { CliError, UsageError } from "../errors";
import { formatTable } from "../output";

const LIST_USAGE = `Usage: toxil report list

Lists your saved reports. The ID column is the input to \`toxil report run\`.
`;

const RUN_USAGE = `Usage: toxil report run <id>

Runs a report: the server resolves the filters, renders the template, stores
a snapshot, and the markdown is printed to stdout (pipe or redirect it).
`;

function describeRange(range: Report["filters"]["dateRange"]): string {
	return typeof range === "string" ? range : `${range.from}..${range.to}`;
}

export async function reportList(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
	});
	if (values.help) {
		ctx.stdout.write(LIST_USAGE);
		return 0;
	}

	const client = createClient(ctx, requireConnection(ctx));
	const reports = await client.listReports();
	if (reports.length === 0) {
		ctx.stderr.write("No reports. Create one in the web UI under Reports.\n");
		return 0;
	}
	ctx.stdout.write(
		`${formatTable(
			["ID", "NAME", "TEMPLATE", "RANGE"],
			reports.map((report) => [
				report.id,
				report.name,
				report.templateId,
				describeRange(report.filters.dateRange),
			]),
		)}\n`,
	);
	return 0;
}

export async function reportRun(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(RUN_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single report <id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	let snapshot: Awaited<ReturnType<typeof client.runReport>>;
	try {
		snapshot = await client.runReport(id);
	} catch (error) {
		if (error instanceof ToxilApiError && error.status === 404) {
			throw new CliError(
				`report "${id}" not found; run \`toxil report list\` to see report ids`,
			);
		}
		throw error;
	}

	// Only the markdown goes to stdout so redirection captures a clean file.
	ctx.stdout.write(snapshot.renderedMarkdown);
	if (!snapshot.renderedMarkdown.endsWith("\n")) ctx.stdout.write("\n");
	ctx.stderr.write(
		`Generated snapshot ${snapshot.id} (${snapshot.resolvedFilters.dateRange.from} – ${snapshot.resolvedFilters.dateRange.to})\n`,
	);
	return 0;
}
