import { parseArgs } from "node:util";

import { formatDuration } from "@spantail/core";

import { createClient, requireConnection } from "../client";
import type { CliContext } from "../context";
import { UsageError } from "../errors";
import { formatTable, truncate } from "../output";

const USAGE = `Usage: spantail search <query>

Searches your visible work entries and your reports.
`;

export async function searchCommand(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(USAGE);
		return 0;
	}
	const query = positionals[0];
	if (query === undefined || positionals.length > 1) {
		throw new UsageError(
			"expected a single <query>; quote it if it contains spaces",
		);
	}
	if (query.trim().length === 0 || query.length > 100) {
		throw new UsageError("the query must be 1-100 characters");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const results = await client.search(query);
	if (results.workEntries.length === 0 && results.reports.length === 0) {
		ctx.stderr.write("No matches.\n");
		return 0;
	}

	const sections: string[] = [];
	if (results.workEntries.length > 0) {
		sections.push(
			`WORK ENTRIES\n${formatTable(
				["DATE", "DURATION", "DESCRIPTION", "TAGS", "ID"],
				results.workEntries.map((entry) => [
					entry.entryDate,
					formatDuration(entry.durationMinutes),
					truncate(entry.description, 60),
					entry.tags.join(","),
					entry.id,
				]),
			)}`,
		);
	}
	if (results.reports.length > 0) {
		sections.push(
			`REPORTS\n${formatTable(
				["ID", "NAME"],
				results.reports.map((report) => [report.id, report.name]),
			)}`,
		);
	}
	ctx.stdout.write(`${sections.join("\n\n")}\n`);
	ctx.stderr.write(
		`${results.workEntries.length} entries, ${results.reports.length} reports\n`,
	);
	return 0;
}
