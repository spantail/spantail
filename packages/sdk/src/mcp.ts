import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReportFilters, ReportFiltersInput } from "@spantail/core";
import {
	batchWorkEntryItemSchema,
	dateRangePresetSchema,
	localDateSchema,
	MAX_WORK_ENTRIES_PER_BATCH,
	tagSchema,
} from "@spantail/core";
import { z } from "zod";

import { SpantailApiError, type SpantailClient } from "./index";

type ToolResult = {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
};

function ok(data: unknown): ToolResult {
	return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): ToolResult {
	const message =
		error instanceof SpantailApiError
			? `API error ${error.status} (${error.code}): ${error.message}`
			: error instanceof Error
				? error.message
				: String(error);
	return { content: [{ type: "text", text: message }], isError: true };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
	try {
		return ok(await fn());
	} catch (error) {
		return fail(error);
	}
}

// The stdio CLI server registers extra local tools and reuses the same
// result/error formatting.
export { run as runTool };

/**
 * Flattened report-scope arguments shared by the report tools. The wire's
 * nested `filters` object is flattened into top-level fields so the tool
 * schemas stay small and unambiguous for an LLM caller.
 */
const reportScopeInputs = {
	workspaceId: z
		.string()
		.optional()
		.describe(
			"Workspace id to scope the report to; omit for instance scope " +
				"(all workspaces the token owner belongs to)",
		),
	projectIds: z
		.array(z.string())
		.max(50)
		.optional()
		.describe("Only entries of these project ids (requires workspaceId)"),
	userIds: z
		.array(z.string())
		.max(50)
		.optional()
		.describe("Only entries by these author user ids"),
	tags: z
		.array(tagSchema)
		.max(20)
		.optional()
		.describe("Only entries carrying at least one of these tags"),
	dateRangePreset: dateRangePresetSchema
		.optional()
		.describe(
			"Relative period, resolved in the token owner's timezone when the " +
				"report renders (mutually exclusive with from/to)",
		),
	from: localDateSchema
		.optional()
		.describe("Absolute period start YYYY-MM-DD (requires to)"),
	to: localDateSchema
		.optional()
		.describe("Absolute period end YYYY-MM-DD (requires from)"),
};

interface ReportScopeArgs {
	workspaceId?: string;
	allWorkspaces?: boolean;
	projectIds?: string[];
	userIds?: string[];
	tags?: string[];
	dateRangePreset?: z.infer<typeof dateRangePresetSchema>;
	from?: string;
	to?: string;
}

/**
 * Assembles the create/update wire filters from the flattened tool args. With
 * `base` (updating), omitted args keep the report's current filters.
 */
function assembleReportFilters(
	args: ReportScopeArgs,
	base?: ReportFilters,
): ReportFiltersInput {
	if (args.dateRangePreset && (args.from || args.to)) {
		throw new Error("dateRangePreset and from/to are mutually exclusive");
	}
	if ((args.from === undefined) !== (args.to === undefined)) {
		throw new Error("from and to must be given together");
	}

	const dateRange =
		args.dateRangePreset ??
		(args.from && args.to ? { from: args.from, to: args.to } : undefined) ??
		base?.dateRange;
	if (dateRange === undefined) {
		throw new Error("provide dateRangePreset or from and to");
	}

	let workspaceIds: string[];
	if (args.allWorkspaces) {
		if (args.workspaceId !== undefined) {
			throw new Error("workspaceId and allWorkspaces are mutually exclusive");
		}
		workspaceIds = [];
	} else if (args.workspaceId !== undefined) {
		workspaceIds = [args.workspaceId];
	} else if (base) {
		if (base.workspaceIds.length > 1) {
			throw new Error(
				"this report has a legacy multi-workspace scope; pass a workspaceId",
			);
		}
		workspaceIds = base.workspaceIds;
	} else {
		workspaceIds = [];
	}

	// An inherited project filter only makes sense in the workspace it belongs
	// to; drop it when the workspace scope changes.
	const sameWorkspace = base && workspaceIds[0] === base.workspaceIds[0];
	return {
		workspaceIds,
		projectIds:
			args.projectIds ?? (sameWorkspace ? base.projectIds : undefined),
		userIds: args.userIds ?? base?.userIds,
		tags: args.tags ?? base?.tags,
		dateRange,
	};
}

/**
 * Registers the Spantail tool set on an MCP server. Tools are thin clients of
 * the REST API via the given SpantailClient; the same registration is used by
 * the remote /mcp endpoint (loopback fetch) and the stdio CLI server.
 */
export function registerSpantailTools(
	server: McpServer,
	client: SpantailClient,
): void {
	server.registerTool(
		"list_workspaces",
		{
			title: "List workspaces",
			description:
				"List the workspaces the token owner belongs to, including each workspace id, " +
				"slug, and name. Call this first to resolve workspace ids.",
		},
		() => run(() => client.listWorkspaces()),
	);

	server.registerTool(
		"list_projects",
		{
			title: "List projects",
			description:
				"List the projects of a workspace with their ids, slugs, names, and status. " +
				"Use list_workspaces first to get the workspace id.",
			inputSchema: {
				workspaceId: z.string().describe("Workspace id from list_workspaces"),
			},
		},
		({ workspaceId }) => run(() => client.listProjects(workspaceId)),
	);

	server.registerTool(
		"log_work",
		{
			title: "Log work",
			description:
				"Create a work entry. Requires a workspace id and project id — resolve them " +
				"with list_workspaces and list_projects first. When entryDate is omitted the " +
				"server uses today in the token owner's timezone.",
			inputSchema: {
				workspaceId: z.string().describe("Workspace id"),
				projectId: z.string().describe("Project id within the workspace"),
				durationMinutes: z
					.number()
					.int()
					.positive()
					.describe("Time spent in minutes"),
				description: z.string().min(1).max(2000).describe("What was worked on"),
				entryDate: localDateSchema
					.optional()
					.describe(
						"Local date YYYY-MM-DD; defaults to today in the token owner's timezone",
					),
				note: z.string().max(10000).optional().describe("Optional longer note"),
				tags: z.array(tagSchema).max(20).optional().describe("Optional tags"),
			},
		},
		(input) => run(() => client.createWorkEntry(input)),
	);

	server.registerTool(
		"log_work_batch",
		{
			title: "Log multiple work entries",
			description:
				"Create up to 100 work entries in one atomic request (all or none) for a " +
				"single workspace. Each entry needs a projectId and an explicit entryDate " +
				"(YYYY-MM-DD) — resolve ids with list_workspaces and list_projects first. " +
				"externalId is normally omitted; set it only to keep a legacy system's id, " +
				"in which case re-sending the same externalId updates the entry instead of " +
				"duplicating it. For large file-based migrations prefer the CLI's " +
				"`spantail entries import`.",
			inputSchema: {
				workspaceId: z.string().describe("Workspace id"),
				entries: z
					.array(batchWorkEntryItemSchema)
					.min(1)
					.max(MAX_WORK_ENTRIES_PER_BATCH)
					.describe(
						"Entries; each needs projectId, entryDate, durationMinutes, description",
					),
			},
		},
		(input) => run(() => client.createWorkEntriesBatch(input)),
	);

	server.registerTool(
		"list_entries",
		{
			title: "List work entries",
			description:
				"List work entries of a workspace, newest first. Filter by project, user, and " +
				"local-date range (inclusive).",
			inputSchema: {
				workspaceId: z.string().describe("Workspace id"),
				projectId: z.string().optional().describe("Filter by project id"),
				userId: z.string().optional().describe("Filter by author user id"),
				from: localDateSchema
					.optional()
					.describe("Start date YYYY-MM-DD (inclusive)"),
				to: localDateSchema
					.optional()
					.describe("End date YYYY-MM-DD (inclusive)"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(200)
					.optional()
					.describe("Max results, default 50"),
			},
		},
		(input) => run(() => client.listWorkEntries(input)),
	);

	server.registerTool(
		"list_agents",
		{
			title: "List agents",
			description:
				"List the token owner's AI agents under a workspace (id, type, name) — " +
				"those with activity there plus the ones registered to it. Call this " +
				"before filtering agent activity by agentId. Agent activity exists only " +
				"on instances with the agents feature enabled.",
			inputSchema: {
				workspaceId: z.string().describe("Workspace id from list_workspaces"),
			},
		},
		({ workspaceId }) => run(() => client.listWorkspaceAgents(workspaceId)),
	);

	server.registerTool(
		"get_agent_stats",
		{
			title: "Get agent activity stats",
			description:
				"Aggregated AI-agent session activity in a workspace over a date window: " +
				"total minutes, token usage, and session counts, bucketed by date and by " +
				"agent. These are agent sessions (not human work entries). Prefer this " +
				"over list_agent_entries for overviews; drill into sessions afterwards.",
			inputSchema: {
				workspaceId: z.string().describe("Workspace id"),
				agentId: z
					.string()
					.optional()
					.describe("Filter to a single agent (from list_agents)"),
				from: localDateSchema.describe("Start date YYYY-MM-DD (inclusive)"),
				to: localDateSchema.describe("End date YYYY-MM-DD (inclusive)"),
			},
		},
		(input) => run(() => client.getAgentEntryStats(input)),
	);

	server.registerTool(
		"list_agent_entries",
		{
			title: "List agent entries",
			description:
				"List AI-agent session entries in a workspace, newest first — one entry " +
				"per agent session with duration, token usage, and context (models, " +
				"branches, repositories, refs). These are agent sessions, separate from " +
				"human work entries (use list_entries for those). For totals over a " +
				"period use get_agent_stats instead.",
			inputSchema: {
				workspaceId: z.string().describe("Workspace id"),
				agentId: z
					.string()
					.optional()
					.describe("Filter to a single agent (from list_agents)"),
				from: localDateSchema
					.optional()
					.describe("Start date YYYY-MM-DD (inclusive)"),
				to: localDateSchema
					.optional()
					.describe("End date YYYY-MM-DD (inclusive)"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(200)
					.optional()
					.describe("Max results, default 50"),
				offset: z
					.number()
					.int()
					.min(0)
					.optional()
					.describe("Rows to skip for pagination"),
			},
		},
		(input) => run(() => client.listAgentEntries(input)),
	);

	server.registerTool(
		"list_report_templates",
		{
			title: "List report templates",
			description:
				"List the instance's report templates. Returns ids usable as a " +
				"report's templateId.",
			inputSchema: {},
		},
		() => run(() => client.listReportTemplates()),
	);

	server.registerTool(
		"list_reports",
		{
			title: "List reports",
			description:
				"List the reports owned by the token owner (metadata only: each " +
				"report's id, name, filters, template id, and note — not the rendered " +
				"body). Fetch the rendered Markdown of one with get_report.",
		},
		() => run(() => client.listReports()),
	);

	server.registerTool(
		"get_report",
		{
			title: "Get a report",
			description:
				"Get a report by id, including its rendered Markdown body, resolved " +
				"period, filters, template id, and free-form note. Get ids from " +
				"list_reports.",
			inputSchema: {
				id: z.string().describe("Report id from list_reports"),
			},
		},
		({ id }) => run(() => client.getReport(id)),
	);

	server.registerTool(
		"update_entry",
		{
			title: "Update a work entry",
			description:
				"Update fields of an existing work entry by id. Only the entry's author can " +
				"update it. Get ids from list_entries.",
			inputSchema: {
				id: z.string().describe("Work entry id"),
				projectId: z
					.string()
					.optional()
					.describe("Move to another project (same workspace)"),
				entryDate: localDateSchema
					.optional()
					.describe("New local date YYYY-MM-DD"),
				durationMinutes: z
					.number()
					.int()
					.positive()
					.optional()
					.describe("New duration"),
				description: z
					.string()
					.min(1)
					.max(2000)
					.optional()
					.describe("New description"),
				note: z
					.string()
					.max(10000)
					.nullable()
					.optional()
					.describe("New note (null clears)"),
				tags: z
					.array(tagSchema)
					.max(20)
					.optional()
					.describe("Replacement tags"),
			},
		},
		({ id, ...patch }) => run(() => client.updateWorkEntry(id, patch)),
	);

	server.registerTool(
		"delete_entry",
		{
			title: "Delete a work entry",
			description:
				"Delete a work entry by id (e.g. a duplicate or mistaken log). Only " +
				"the entry's author can delete it. Get ids from list_entries.",
			inputSchema: {
				id: z.string().describe("Work entry id"),
			},
		},
		({ id }) =>
			run(async () => {
				await client.deleteWorkEntry(id);
				return { deleted: id };
			}),
	);

	server.registerTool(
		"create_report",
		{
			title: "Create a report",
			description:
				"Create a report: renders a template over the work entries selected " +
				"by the scope and period. Use list_report_templates for template ids. " +
				"When name is omitted the template's suggested name is adopted. " +
				"Returns the report including its rendered Markdown.",
			inputSchema: {
				templateId: z
					.string()
					.describe("Report template id from list_report_templates"),
				name: z
					.string()
					.max(100)
					.optional()
					.describe("Report name; omit to adopt the template's suggestion"),
				note: z
					.string()
					.max(20000)
					.optional()
					.describe("Free-form Markdown note appended to the report"),
				...reportScopeInputs,
			},
		},
		({ templateId, name, note, ...scope }) =>
			run(async () => {
				const filters = assembleReportFilters(scope);
				let reportName = name;
				let reportNote = note;
				// Name and note suggestions are independent (like the web compose
				// form): an explicit name must not discard a suggested note.
				if (!reportName || reportNote === undefined) {
					const preview = await client.previewReport({ templateId, filters });
					reportName ||= preview.suggestedName;
					reportNote ??= preview.suggestedNote || undefined;
				}
				if (!reportName) {
					// No name Liquid on the template: fall back to its display name,
					// like the CLI does.
					const templates = await client.listReportTemplates();
					reportName = templates.find(
						(template) => template.id === templateId,
					)?.name;
				}
				if (!reportName) {
					throw new Error("name is required for this template");
				}
				return client.createReport({
					name: reportName,
					templateId,
					filters,
					note: reportNote,
				});
			}),
	);

	server.registerTool(
		"preview_report",
		{
			title: "Preview a report",
			description:
				"Render a report from a template, scope, and period WITHOUT saving " +
				"it. Returns the rendered Markdown plus entry count, total minutes, " +
				"and the template's suggested name. Use it to iterate before " +
				"create_report.",
			inputSchema: {
				templateId: z
					.string()
					.describe("Report template id from list_report_templates"),
				name: z
					.string()
					.max(100)
					.optional()
					.describe("Report name to render with"),
				note: z
					.string()
					.max(20000)
					.optional()
					.describe("Free-form Markdown note to render with"),
				...reportScopeInputs,
			},
		},
		({ templateId, name, note, ...scope }) =>
			run(() =>
				client.previewReport({
					templateId,
					name,
					note,
					filters: assembleReportFilters(scope),
				}),
			),
	);

	server.registerTool(
		"update_report",
		{
			title: "Update a report",
			description:
				"Re-render an existing report with changed fields, appending a new " +
				"version. Omitted fields keep the report's current values; pass an " +
				"empty array to clear projectIds/userIds/tags. Only the report's " +
				"owner can update it. Get ids from list_reports.",
			inputSchema: {
				id: z.string().describe("Report id from list_reports"),
				templateId: z
					.string()
					.optional()
					.describe("Switch to another template"),
				allWorkspaces: z
					.boolean()
					.optional()
					.describe(
						"Switch the report to instance scope (all workspaces the token " +
							"owner belongs to); omitting workspaceId keeps the current scope",
					),
				name: z.string().max(100).optional().describe("New report name"),
				note: z
					.string()
					.max(20000)
					.optional()
					.describe("New note (empty string clears it)"),
				...reportScopeInputs,
			},
		},
		({ id, templateId, name, note, ...scope }) =>
			run(async () => {
				// The update wire is a full replace, so seed every field from the
				// current report and override with the provided args.
				const current = await client.getReport(id);
				return client.updateReport(id, {
					name: name ?? current.name,
					templateId: templateId ?? current.templateId,
					filters: assembleReportFilters(scope, current.filters),
					note: note === "" ? undefined : (note ?? current.note ?? undefined),
				});
			}),
	);

	server.registerTool(
		"search",
		{
			title: "Search",
			description:
				"Search the token owner's visible work entries and reports by text. " +
				"Returns matching work entries in full and matching reports as " +
				"id/name pairs.",
			inputSchema: {
				q: z.string().min(1).max(100).describe("Search text"),
			},
		},
		({ q }) => run(() => client.search(q)),
	);
}
