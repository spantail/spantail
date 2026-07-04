import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { createClient, requireConnection } from "../client";
import type { CliContext } from "../context";
import { CliError, UsageError } from "../errors";
import { importEntries } from "../import-entries";
import { requireWorkspaceSlug } from "../resolve";

const USAGE = `Usage: spantail entries import <file.jsonl> [options]

Bulk-imports work entries from a JSONL file (one JSON object per line):

  {"project":"platform","entryDate":"2024-07-15","durationMinutes":90,"description":"..."}

Fields: entryDate (required), durationMinutes, description, and optional
project (slug), note, tags, startedAt, endedAt, externalId. The whole file is
validated before anything is sent; entries are then posted in atomic batches
of 1000. An externalId becomes the entry's id, so re-importing the same file
updates those entries instead of duplicating them.

Options:
  --workspace <slug>   Workspace (default: the configured default workspace)
  --project <slug>     Default project for lines without a "project" field
  --dry-run            Validate and resolve projects without importing
  -h, --help           Show this help
`;

export async function entriesImport(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			workspace: { type: "string" },
			project: { type: "string" },
			"dry-run": { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(USAGE);
		return 0;
	}

	const file = positionals[0];
	if (file === undefined) throw new UsageError("missing <file.jsonl>");
	if (positionals.length > 1) {
		throw new UsageError("expected a single <file.jsonl>");
	}

	let content: string;
	try {
		content = await readFile(file, "utf8");
	} catch (error) {
		throw new CliError(
			`cannot read "${file}": ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const client = createClient(ctx, requireConnection(ctx));
	const summary = await importEntries(client, {
		workspaceSlug: requireWorkspaceSlug(ctx, values.workspace),
		defaultProjectSlug: values.project,
		content,
		dryRun: values["dry-run"],
		onProgress: (p) => {
			if (p.requests > 1) {
				ctx.stdout.write(
					`imported ${p.sent}/${p.total} (request ${p.request}/${p.requests})\n`,
				);
			}
		},
	});

	const requests = `${summary.requests} request${summary.requests === 1 ? "" : "s"}`;
	const entriesCount = `${summary.imported} ${summary.imported === 1 ? "entry" : "entries"}`;
	ctx.stdout.write(
		summary.dryRun
			? `Dry run: ${entriesCount} across ${summary.projects.length} project(s) would be imported into ${summary.workspace} (${requests})\n`
			: `Imported ${entriesCount} into ${summary.workspace} (${requests})\n`,
	);
	return 0;
}
