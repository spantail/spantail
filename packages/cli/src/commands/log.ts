import { parseArgs } from "node:util";

import { formatDuration, localDateSchema, parseDuration } from "@toxil/core";

import { createClient, requireConnection } from "../client";
import type { CliContext } from "../context";
import { UsageError } from "../errors";
import {
	requireWorkspaceSlug,
	resolveProject,
	resolveWorkspace,
} from "../resolve";

const USAGE = `Usage: toxil log <description> --project <slug> --duration <value> [options]

Logs a work entry. Duration accepts minutes or h/m forms: 90, 90m, 2h, 1h30m.

Options:
  --project <slug>     Project to log against (required)
  --duration <value>   Time spent (required)
  --date <YYYY-MM-DD>  Entry date (default: today in the workspace timezone)
  --note <text>        Longer free-form note
  --tag <tag>          Tag; repeat the flag for multiple tags
  --workspace <slug>   Workspace (default: the configured default workspace)
  -h, --help           Show this help
`;

export async function logCommand(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			project: { type: "string" },
			duration: { type: "string" },
			date: { type: "string" },
			note: { type: "string" },
			tag: { type: "string", multiple: true },
			workspace: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(USAGE);
		return 0;
	}

	const description = positionals[0];
	if (description === undefined) throw new UsageError("missing <description>");
	if (positionals.length > 1) {
		throw new UsageError(
			"expected a single <description>; quote it if it contains spaces",
		);
	}
	if (!values.project) throw new UsageError("--project is required");
	if (!values.duration) throw new UsageError("--duration is required");
	const durationMinutes = parseDuration(values.duration);
	if (durationMinutes === null) {
		throw new UsageError(
			`invalid duration "${values.duration}"; use forms like 90, 90m, 2h, or 1h30m`,
		);
	}
	if (values.date && !localDateSchema.safeParse(values.date).success) {
		throw new UsageError(`invalid date "${values.date}"; use YYYY-MM-DD`);
	}

	const client = createClient(ctx, requireConnection(ctx));
	const workspace = await resolveWorkspace(
		client,
		requireWorkspaceSlug(ctx, values.workspace),
	);
	const project = await resolveProject(client, workspace, values.project);

	const entry = await client.createWorkEntry({
		workspaceId: workspace.id,
		projectId: project.id,
		durationMinutes,
		description,
		// Omitted entryDate lets the server default to today in the
		// workspace timezone.
		...(values.date ? { entryDate: values.date } : {}),
		...(values.note ? { note: values.note } : {}),
		...(values.tag?.length ? { tags: values.tag } : {}),
	});

	ctx.stdout.write(
		`Logged ${formatDuration(entry.durationMinutes)} to ${workspace.slug}/${project.slug} on ${entry.entryDate} (id: ${entry.id})\n`,
	);
	return 0;
}
