import { parseArgs } from "node:util";

import { formatDuration, localDateSchema } from "@toxil/core";

import { createClient, requireConnection } from "../client";
import type { CliContext } from "../context";
import { UsageError } from "../errors";
import { formatTable, truncate } from "../output";
import { requireWorkspaceSlug, resolveWorkspace } from "../resolve";

const DEFAULT_LIMIT = 20;

const USAGE = `Usage: toxil entries list [options]

Lists work entries, newest first.

Options:
  --workspace <slug>   Workspace (default: the configured default workspace)
  --project <slug>     Only entries for this project
  --from <YYYY-MM-DD>  Only entries on or after this date
  --to <YYYY-MM-DD>    Only entries on or before this date
  --limit <n>          Maximum entries to show (default: ${DEFAULT_LIMIT}, max: 200)
  -h, --help           Show this help
`;

export async function entriesList(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			workspace: { type: "string" },
			project: { type: "string" },
			from: { type: "string" },
			to: { type: "string" },
			limit: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		ctx.stdout.write(USAGE);
		return 0;
	}

	for (const flag of ["from", "to"] as const) {
		const value = values[flag];
		if (value && !localDateSchema.safeParse(value).success) {
			throw new UsageError(`invalid --${flag} "${value}"; use YYYY-MM-DD`);
		}
	}
	let limit = DEFAULT_LIMIT;
	if (values.limit !== undefined) {
		limit = Number(values.limit);
		if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
			throw new UsageError(
				`invalid --limit "${values.limit}"; use an integer between 1 and 200`,
			);
		}
	}

	const client = createClient(ctx, requireConnection(ctx));
	const workspace = await resolveWorkspace(
		client,
		requireWorkspaceSlug(ctx, values.workspace),
	);
	// Always fetched: entries reference projects by id, the table shows slugs.
	const projects = await client.listProjects(workspace.id);
	let projectId: string | undefined;
	if (values.project) {
		const project = projects.find((p) => p.slug === values.project);
		if (!project) {
			const available = projects.map((p) => p.slug).join(", ") || "none";
			throw new UsageError(
				`unknown project "${values.project}" in workspace "${workspace.slug}" (available: ${available})`,
			);
		}
		projectId = project.id;
	}

	const entries = await client.listWorkEntries({
		workspaceId: workspace.id,
		projectId,
		from: values.from,
		to: values.to,
		limit,
	});
	if (entries.length === 0) {
		ctx.stderr.write("No entries found.\n");
		return 0;
	}

	const slugById = new Map(projects.map((p) => [p.id, p.slug]));
	ctx.stdout.write(
		`${formatTable(
			["DATE", "DURATION", "PROJECT", "DESCRIPTION", "TAGS"],
			entries.map((entry) => [
				entry.entryDate,
				formatDuration(entry.durationMinutes),
				slugById.get(entry.projectId) ?? entry.projectId,
				truncate(entry.description, 60),
				entry.tags.join(","),
			]),
		)}\n`,
	);
	const total = entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
	ctx.stderr.write(
		`${entries.length} entries, total ${formatDuration(total)}\n`,
	);
	return 0;
}
