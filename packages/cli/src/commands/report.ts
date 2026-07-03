import { parseArgs } from "node:util";

import type {
	AbsoluteDateRange,
	Report,
	ReportTemplate,
} from "@spantail/core";
import { formatDuration, localDateSchema } from "@spantail/core";
import type { SpantailClient } from "@spantail/sdk";
import { SpantailApiError } from "@spantail/sdk";

import { createClient, requireConnection } from "../client";
import { confirmAction } from "../confirm";
import type { CliContext } from "../context";
import { CliError, UsageError } from "../errors";
import { formatTable, truncate } from "../output";
import {
	buildReportFilters,
	REPORT_FILTER_FLAGS_HELP,
	REPORT_FILTER_OPTIONS,
} from "../report-filters";
import {
	requireWorkspaceSlug,
	resolveProject,
	resolveWorkspace,
} from "../resolve";

const LIST_USAGE = `Usage: spantail report list [options]

Lists your reports. The ID column is the input to \`spantail report view\`.

Options:
  --template <id>      Only reports rendered from this template
  --workspace <slug>   Workspace used to resolve --project (default: the
                       configured default workspace)
  --project <slug>     Only reports scoped to this project
  --from <YYYY-MM-DD>  Only reports whose period overlaps on or after this date
  --to <YYYY-MM-DD>    Only reports whose period overlaps on or before this date
  --limit <n>          Maximum reports to show (default: all, max: 200)
  -h, --help           Show this help
`;

const VIEW_USAGE = `Usage: spantail report view <id>

Prints a report's rendered Markdown to stdout (pipe or redirect it).
`;

const TEMPLATES_USAGE = `Usage: spantail report templates

Lists the instance's report templates. The ID column is the input to
\`spantail report create --template\`.
`;

const CREATE_USAGE = `Usage: spantail report create --template <id> [options]

Creates a report: renders the template over the entries selected by the
filters. Without --range/--from/--to the template's default range applies
(falling back to today). Without --name the template's suggested name is
adopted.

Options:
  --template <id>        Report template (required; see \`spantail report templates\`)
  --name <text>          Report name (default: the template's suggestion)
  --note <text>          Free-form Markdown note appended to the report
${REPORT_FILTER_FLAGS_HELP}
  -h, --help             Show this help
`;

const PREVIEW_USAGE = `Usage: spantail report preview --template <id> [options]

Renders a report from the given filters without saving it; the Markdown goes
to stdout. Same options as \`spantail report create\`.

Options:
  --template <id>        Report template (required)
  --name <text>          Report name to render with
  --note <text>          Free-form Markdown note to render with
${REPORT_FILTER_FLAGS_HELP}
  -h, --help             Show this help
`;

const EDIT_USAGE = `Usage: spantail report edit <id> [options]

Re-renders a report with changed fields, appending a new version. Omitted
flags keep the report's current values.

Options:
  --template <id>        Switch to another template
  --name <text>          New report name
  --note <text>          New note
  --clear-note           Remove the note
  --clear-projects       Remove the project filter
  --clear-users          Remove the user filter
  --clear-tags           Remove the tag filter
${REPORT_FILTER_FLAGS_HELP}
  -h, --help             Show this help
`;

const DELETE_USAGE = `Usage: spantail report delete <id> [options]

Deletes a report (including its share links and versions). Asks for
confirmation unless --yes is passed; a non-interactive session requires --yes.

Options:
  --yes        Skip the confirmation prompt
  -h, --help   Show this help
`;

function describeRange(range: AbsoluteDateRange): string {
	return `${range.from}..${range.to}`;
}

async function fetchReport(
	client: SpantailClient,
	id: string,
): Promise<Report> {
	try {
		return await client.getReport(id);
	} catch (error) {
		if (error instanceof SpantailApiError && error.status === 404) {
			throw new CliError(
				`report "${id}" not found; run \`spantail report list\` to see report ids`,
			);
		}
		throw error;
	}
}

async function requireTemplate(
	client: SpantailClient,
	id: string,
): Promise<ReportTemplate> {
	const templates = await client.listReportTemplates();
	const match = templates.find((template) => template.id === id);
	if (!match) {
		const available =
			templates.map((template) => template.id).join(", ") || "none";
		throw new CliError(`unknown template "${id}" (available: ${available})`);
	}
	return match;
}

export async function reportList(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			template: { type: "string" },
			workspace: { type: "string" },
			project: { type: "string" },
			from: { type: "string" },
			to: { type: "string" },
			limit: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		ctx.stdout.write(LIST_USAGE);
		return 0;
	}
	for (const flag of ["from", "to"] as const) {
		const value = values[flag];
		if (value && !localDateSchema.safeParse(value).success) {
			throw new UsageError(`invalid --${flag} "${value}"; use YYYY-MM-DD`);
		}
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
	let projectId: string | undefined;
	if (values.project) {
		const workspace = await resolveWorkspace(
			client,
			requireWorkspaceSlug(ctx, values.workspace),
		);
		projectId = (await resolveProject(client, workspace, values.project)).id;
	}

	const reports = await client.listReports({
		templateId: values.template,
		projectId,
		from: values.from,
		to: values.to,
		limit,
	});
	if (reports.length === 0) {
		ctx.stderr.write(
			"No reports. Create one with `spantail report create` or in the web UI.\n",
		);
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
	const report = await fetchReport(client, id);

	// Only the markdown goes to stdout so redirection captures a clean file.
	ctx.stdout.write(report.renderedMarkdown);
	if (!report.renderedMarkdown.endsWith("\n")) ctx.stdout.write("\n");
	ctx.stderr.write(
		`Report ${report.name} (${report.filters.dateRange.from} – ${report.filters.dateRange.to})\n`,
	);
	return 0;
}

export async function reportTemplates(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
	});
	if (values.help) {
		ctx.stdout.write(TEMPLATES_USAGE);
		return 0;
	}

	const client = createClient(ctx, requireConnection(ctx));
	const templates = await client.listReportTemplates();
	ctx.stdout.write(
		`${formatTable(
			["ID", "NAME", "DEFAULT", "ENABLED", "RANGE", "DESCRIPTION"],
			templates.map((template) => [
				template.id,
				template.name,
				template.isDefault ? "yes" : "",
				template.enabled ? "yes" : "no",
				template.defaultDateRange?.replaceAll("_", "-") ?? "",
				truncate(template.description ?? "", 40),
			]),
		)}\n`,
	);
	return 0;
}

/** Compose-time name/note: explicit flags win, the template's suggestion fills. */
async function composeNameAndNote(
	client: SpantailClient,
	template: ReportTemplate,
	filters: Parameters<SpantailClient["previewReport"]>[0]["filters"],
	values: { name?: string; note?: string },
): Promise<{ name: string; note: string | undefined }> {
	if (values.name) return { name: values.name, note: values.note };
	const preview = await client.previewReport({
		templateId: template.id,
		filters,
	});
	return {
		name: preview.suggestedName || template.name,
		note: values.note ?? (preview.suggestedNote || undefined),
	};
}

export async function reportCreate(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			...REPORT_FILTER_OPTIONS,
			template: { type: "string" },
			name: { type: "string" },
			note: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		ctx.stdout.write(CREATE_USAGE);
		return 0;
	}
	if (!values.template) throw new UsageError("--template is required");

	const client = createClient(ctx, requireConnection(ctx));
	const template = await requireTemplate(client, values.template);
	const filters = await buildReportFilters(client, ctx, values, {
		fallbackRange: template.defaultDateRange ?? "today",
	});
	const { name, note } = await composeNameAndNote(
		client,
		template,
		filters,
		values,
	);

	const report = await client.createReport({
		name,
		templateId: template.id,
		filters,
		note,
	});
	ctx.stdout.write(
		`Created report "${report.name}" (id: ${report.id}, ${describeRange(report.filters.dateRange)})\n`,
	);
	return 0;
}

export async function reportPreview(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			...REPORT_FILTER_OPTIONS,
			template: { type: "string" },
			name: { type: "string" },
			note: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		ctx.stdout.write(PREVIEW_USAGE);
		return 0;
	}
	if (!values.template) throw new UsageError("--template is required");

	const client = createClient(ctx, requireConnection(ctx));
	const template = await requireTemplate(client, values.template);
	const filters = await buildReportFilters(client, ctx, values, {
		fallbackRange: template.defaultDateRange ?? "today",
	});

	const preview = await client.previewReport({
		templateId: template.id,
		filters,
		name: values.name,
		note: values.note,
	});
	ctx.stdout.write(preview.content);
	if (!preview.content.endsWith("\n")) ctx.stdout.write("\n");
	const suggestion = preview.suggestedName
		? `, suggested name: ${preview.suggestedName}`
		: "";
	ctx.stderr.write(
		`${preview.entryCount} entries, total ${formatDuration(preview.totalMinutes)}${suggestion}\n`,
	);
	return 0;
}

export async function reportEdit(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			...REPORT_FILTER_OPTIONS,
			template: { type: "string" },
			name: { type: "string" },
			note: { type: "string" },
			"clear-note": { type: "boolean" },
			"clear-projects": { type: "boolean" },
			"clear-users": { type: "boolean" },
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
		throw new UsageError("expected a single report <id>");
	}
	const clearPairs = [
		["note", "clear-note"],
		["project", "clear-projects"],
		["user", "clear-users"],
		["tag", "clear-tags"],
	] as const;
	for (const [flag, clear] of clearPairs) {
		const value = values[flag];
		if (values[clear] && (Array.isArray(value) ? value.length : value)) {
			throw new UsageError(`--${flag} and --${clear} are mutually exclusive`);
		}
	}

	const client = createClient(ctx, requireConnection(ctx));
	// The update wire is a full replace, so seed every field from the current
	// report and override with the provided flags.
	const report = await fetchReport(client, id);
	const filters = await buildReportFilters(client, ctx, values, {
		base: report.filters,
	});
	if (values["clear-projects"]) filters.projectIds = undefined;
	if (values["clear-users"]) filters.userIds = undefined;
	if (values["clear-tags"]) filters.tags = undefined;

	const note = values["clear-note"]
		? undefined
		: (values.note ?? report.note ?? undefined);
	const updated = await client.updateReport(id, {
		name: values.name ?? report.name,
		templateId: values.template ?? report.templateId,
		filters,
		note,
	});
	ctx.stdout.write(
		`Updated report "${updated.name}" (id: ${updated.id}, version ${updated.version}, ${describeRange(updated.filters.dateRange)})\n`,
	);
	return 0;
}

export async function reportDelete(
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
		throw new UsageError("expected a single report <id>");
	}

	const client = createClient(ctx, requireConnection(ctx));
	const report = await fetchReport(client, id);
	const confirmed = await confirmAction(
		ctx,
		`Delete report "${report.name}" (${report.id})?`,
		values.yes,
	);
	if (!confirmed) {
		ctx.stderr.write("Cancelled.\n");
		return 1;
	}
	await client.deleteReport(id);
	ctx.stdout.write(`Deleted report ${id}\n`);
	return 0;
}
