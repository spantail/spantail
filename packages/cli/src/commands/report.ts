import { parseArgs } from "node:util";

import type { AbsoluteDateRange } from "@spantail/core";
import { SpantailApiError } from "@spantail/sdk";

import { createClient, requireConnection } from "../client";
import type { CliContext } from "../context";
import { CliError, UsageError } from "../errors";
import { formatTable } from "../output";

const LIST_USAGE = `Usage: spantail report list

Lists your reports. The ID column is the input to \`spantail report view\`.
`;

const VIEW_USAGE = `Usage: spantail report view <id>

Prints a report's rendered Markdown to stdout (pipe or redirect it). Reports
are created and edited in the web UI.
`;

function describeRange(range: AbsoluteDateRange): string {
	return `${range.from}..${range.to}`;
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

export async function reportView(
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
		throw new UsageError("expected a single report <id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	let report: Awaited<ReturnType<typeof client.getReport>>;
	try {
		report = await client.getReport(id);
	} catch (error) {
		if (error instanceof SpantailApiError && error.status === 404) {
			throw new CliError(
				`report "${id}" not found; run \`spantail report list\` to see report ids`,
			);
		}
		throw error;
	}

	// Only the markdown goes to stdout so redirection captures a clean file.
	ctx.stdout.write(report.renderedMarkdown);
	if (!report.renderedMarkdown.endsWith("\n")) ctx.stdout.write("\n");
	ctx.stderr.write(
		`Report ${report.name} (${report.filters.dateRange.from} – ${report.filters.dateRange.to})\n`,
	);
	return 0;
}
