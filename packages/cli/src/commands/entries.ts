import { parseArgs } from "node:util";

import type { UpdateWorkEntryInput, WorkEntry } from "@spantail/core";
import { formatDuration, localDateSchema, parseDuration } from "@spantail/core";
import type { SpantailClient } from "@spantail/sdk";
import { SpantailApiError } from "@spantail/sdk";

import { createClient, requireConnection } from "../client";
import { confirmAction } from "../confirm";
import type { CliContext } from "../context";
import { CliError, UsageError } from "../errors";
import { formatTable, truncate } from "../output";
import {
	requireWorkspaceSlug,
	resolveProject,
	resolveUsers,
	resolveWorkspace,
} from "../resolve";

const DEFAULT_LIMIT = 20;

const USAGE = `Usage: spantail entries list [options]

Lists work entries, newest first. The ID column is the input to
\`spantail entries view/edit/delete\`.

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
			["DATE", "DURATION", "PROJECT", "DESCRIPTION", "TAGS", "ID"],
			entries.map((entry) => [
				entry.entryDate,
				formatDuration(entry.durationMinutes),
				entry.projectId
					? (slugById.get(entry.projectId) ?? entry.projectId)
					: "(no project)",
				truncate(entry.description, 60),
				entry.tags.join(","),
				entry.id,
			]),
		)}\n`,
	);
	const total = entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
	ctx.stderr.write(
		`${entries.length} entries, total ${formatDuration(total)}\n`,
	);
	return 0;
}

async function fetchEntry(
	client: SpantailClient,
	id: string,
): Promise<WorkEntry> {
	try {
		return await client.getWorkEntry(id);
	} catch (error) {
		if (error instanceof SpantailApiError && error.status === 404) {
			throw new CliError(
				`work entry "${id}" not found; run \`spantail entries list\` to see entry ids`,
			);
		}
		throw error;
	}
}

const VIEW_USAGE = `Usage: spantail entries view <id>

Prints one work entry in full. Get ids from \`spantail entries list\`.
`;

export async function entriesView(
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
		throw new UsageError("expected a single entry <id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const entry = await fetchEntry(client, id);
	const projects = await client.listProjects(entry.workspaceId);
	const projectSlug = entry.projectId
		? (projects.find((p) => p.id === entry.projectId)?.slug ?? entry.projectId)
		: "(no project)";

	const field = (label: string, value: string) =>
		`${label.padEnd(12)} ${value}\n`;
	ctx.stdout.write(field("ID", entry.id));
	ctx.stdout.write(field("Date", entry.entryDate));
	ctx.stdout.write(field("Duration", formatDuration(entry.durationMinutes)));
	ctx.stdout.write(field("Project", projectSlug));
	ctx.stdout.write(field("Description", entry.description));
	if (entry.note !== null) ctx.stdout.write(field("Note", entry.note));
	if (entry.tags.length > 0)
		ctx.stdout.write(field("Tags", entry.tags.join(", ")));
	ctx.stdout.write(field("Source", entry.source));
	ctx.stdout.write(field("Created", entry.createdAt));
	ctx.stdout.write(field("Updated", entry.updatedAt));
	return 0;
}

const EDIT_USAGE = `Usage: spantail entries edit <id> [options]

Updates fields of a work entry; only the flags you pass are changed. Only the
entry's author can edit it.

Options:
  --project <slug>       Move the entry to another project (same workspace)
  --date <YYYY-MM-DD>    New entry date
  --duration <value>     New duration: 90, 90m, 2h, 1h30m
  --description <text>   New description
  --note <text>          New note (replaces the current one)
  --clear-note           Remove the note
  --tag <tag>            Replacement tag set; repeat the flag for multiple tags
  --clear-tags           Remove all tags
  -h, --help             Show this help
`;

export async function entriesEdit(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			project: { type: "string" },
			date: { type: "string" },
			duration: { type: "string" },
			description: { type: "string" },
			note: { type: "string" },
			"clear-note": { type: "boolean" },
			tag: { type: "string", multiple: true },
			"clear-tags": { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});
	if (values.help) {
		ctx.stdout.write(EDIT_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single entry <id>");
	}
	if (values.note !== undefined && values["clear-note"]) {
		throw new UsageError("--note and --clear-note are mutually exclusive");
	}
	if (values.tag?.length && values["clear-tags"]) {
		throw new UsageError("--tag and --clear-tags are mutually exclusive");
	}

	const patch: UpdateWorkEntryInput = {};
	if (values.date !== undefined) {
		if (!localDateSchema.safeParse(values.date).success) {
			throw new UsageError(`invalid --date "${values.date}"; use YYYY-MM-DD`);
		}
		patch.entryDate = values.date;
	}
	if (values.duration !== undefined) {
		const durationMinutes = parseDuration(values.duration);
		if (durationMinutes === null) {
			throw new UsageError(
				`invalid duration "${values.duration}"; use forms like 90, 90m, 2h, or 1h30m`,
			);
		}
		patch.durationMinutes = durationMinutes;
	}
	if (values.description !== undefined) patch.description = values.description;
	if (values.note !== undefined) patch.note = values.note;
	if (values["clear-note"]) patch.note = null;
	if (values.tag?.length) patch.tags = values.tag;
	if (values["clear-tags"]) patch.tags = [];

	const client = createClient(ctx, requireConnection(ctx));
	if (values.project !== undefined) {
		// The project flag is a slug; entries carry only ids, so resolve it in
		// the entry's workspace.
		const entry = await fetchEntry(client, id);
		const workspace = (await client.listWorkspaces()).find(
			(ws) => ws.id === entry.workspaceId,
		);
		if (!workspace) {
			throw new CliError(
				"you are no longer a member of this entry's workspace",
			);
		}
		patch.projectId = (
			await resolveProject(client, workspace, values.project)
		).id;
	}
	if (Object.keys(patch).length === 0) {
		throw new UsageError("nothing to update; pass at least one field flag");
	}

	const updated = await client.updateWorkEntry(id, patch);
	ctx.stdout.write(
		`Updated entry ${updated.id} (${updated.entryDate}, ${formatDuration(updated.durationMinutes)})\n`,
	);
	return 0;
}

const DELETE_USAGE = `Usage: spantail entries delete <id> [options]

Deletes a work entry. Asks for confirmation unless --yes is passed; a
non-interactive session requires --yes.

Options:
  --yes        Skip the confirmation prompt
  -h, --help   Show this help
`;

export async function entriesDelete(
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
		ctx.stdout.write(DELETE_USAGE);
		return 0;
	}
	const id = positionals[0];
	if (id === undefined || positionals.length > 1) {
		throw new UsageError("expected a single entry <id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const entry = await fetchEntry(client, id);
	const confirmed = await confirmAction(
		ctx,
		`Delete entry ${entry.id} (${entry.entryDate}, "${truncate(entry.description, 40)}")?`,
		values.yes,
	);
	if (!confirmed) {
		ctx.stderr.write("Cancelled.\n");
		return 1;
	}
	await client.deleteWorkEntry(id);
	ctx.stdout.write(`Deleted entry ${id}\n`);
	return 0;
}

const STATS_USAGE = `Usage: spantail entries stats [options]

Shows aggregated work-entry stats: totals plus by-date, by-project, and
by-user breakdowns.

Options:
  --workspace <slug>    Workspace (default: the configured default workspace)
  --project <slug>      Only entries for this project
  --user <id-or-email>  Only entries by this user
  --tag <tag>           Only entries carrying this tag
  --from <YYYY-MM-DD>   Only entries on or after this date
  --to <YYYY-MM-DD>     Only entries on or before this date
  -h, --help            Show this help
`;

export async function entriesStats(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			workspace: { type: "string" },
			project: { type: "string" },
			user: { type: "string" },
			tag: { type: "string" },
			from: { type: "string" },
			to: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		ctx.stdout.write(STATS_USAGE);
		return 0;
	}
	for (const flag of ["from", "to"] as const) {
		const value = values[flag];
		if (value && !localDateSchema.safeParse(value).success) {
			throw new UsageError(`invalid --${flag} "${value}"; use YYYY-MM-DD`);
		}
	}

	const client = createClient(ctx, requireConnection(ctx));
	const workspace = await resolveWorkspace(
		client,
		requireWorkspaceSlug(ctx, values.workspace),
	);
	const projects = await client.listProjects(workspace.id);
	let projectId: string | undefined;
	if (values.project) {
		projectId = (await resolveProject(client, workspace, values.project)).id;
	}
	let userId: string | undefined;
	if (values.user) {
		userId = (await resolveUsers(client, workspace, [values.user]))[0]?.userId;
	}

	const stats = await client.getWorkEntryStats({
		workspaceId: workspace.id,
		projectId,
		userId,
		tag: values.tag,
		from: values.from,
		to: values.to,
	});
	if (stats.entryCount === 0) {
		ctx.stderr.write("No entries found.\n");
		return 0;
	}

	ctx.stdout.write(
		`Total ${formatDuration(stats.totalMinutes)} across ${stats.entryCount} entries\n`,
	);
	ctx.stdout.write(
		`\nBY DATE\n${formatTable(
			["DATE", "DURATION", "ENTRIES"],
			stats.byDate.map((row) => [
				row.date,
				formatDuration(row.minutes),
				String(row.count),
			]),
		)}\n`,
	);
	const slugById = new Map(projects.map((p) => [p.id, p.slug]));
	ctx.stdout.write(
		`\nBY PROJECT\n${formatTable(
			["PROJECT", "DURATION", "ENTRIES"],
			stats.byProject.map((row) => [
				row.projectId
					? (slugById.get(row.projectId) ?? row.projectId)
					: "(no project)",
				formatDuration(row.minutes),
				String(row.count),
			]),
		)}\n`,
	);
	if (stats.byUser.length > 0) {
		const members = await client.listMembers(workspace.id);
		const nameById = new Map(members.map((m) => [m.userId, m.name]));
		ctx.stdout.write(
			`\nBY USER\n${formatTable(
				["USER", "DURATION", "ENTRIES"],
				stats.byUser.map((row) => [
					nameById.get(row.userId) ?? row.userId,
					formatDuration(row.minutes),
					String(row.count),
				]),
			)}\n`,
		);
	}
	return 0;
}

const TAGS_USAGE = `Usage: spantail entries tags [options]

Lists the distinct tags in scope, one per line.

Options:
  --workspace <slug>   Workspace (default: the configured default workspace)
  --project <slug>     Only tags used in this project
  -h, --help           Show this help
`;

export async function entriesTags(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			workspace: { type: "string" },
			project: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		ctx.stdout.write(TAGS_USAGE);
		return 0;
	}

	const client = createClient(ctx, requireConnection(ctx));
	const workspace = await resolveWorkspace(
		client,
		requireWorkspaceSlug(ctx, values.workspace),
	);
	let projectId: string | undefined;
	if (values.project) {
		projectId = (await resolveProject(client, workspace, values.project)).id;
	}

	const tags = await client.listWorkEntryTags({
		workspaceId: workspace.id,
		projectId,
	});
	if (tags.length === 0) {
		ctx.stderr.write("No tags found.\n");
		return 0;
	}
	for (const tag of tags) ctx.stdout.write(`${tag}\n`);
	return 0;
}
