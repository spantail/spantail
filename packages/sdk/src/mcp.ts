import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { localDateSchema, tagSchema } from "@toxil/core";
import { z } from "zod";

import { ToxilApiError, type ToxilClient } from "./index";

type ToolResult = {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
};

function ok(data: unknown): ToolResult {
	return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): ToolResult {
	const message =
		error instanceof ToxilApiError
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

/**
 * Registers the Toxil tool set on an MCP server. Tools are thin clients of
 * the REST API via the given ToxilClient; the same registration is used by
 * the remote /mcp endpoint (loopback fetch) and the stdio CLI server.
 */
export function registerToxilTools(
	server: McpServer,
	client: ToxilClient,
): void {
	server.registerTool(
		"list_workspaces",
		{
			title: "List workspaces",
			description:
				"List the workspaces the token owner belongs to, including each workspace id, " +
				"slug, name, and timezone. Call this first to resolve workspace ids.",
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
				"server uses today in the workspace's timezone.",
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
						"Local date YYYY-MM-DD; defaults to today in the workspace timezone",
					),
				note: z.string().max(10000).optional().describe("Optional longer note"),
				tags: z.array(tagSchema).max(20).optional().describe("Optional tags"),
			},
		},
		(input) => run(() => client.createWorkEntry(input)),
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
		"list_report_templates",
		{
			title: "List report templates",
			description:
				"List the instance's report templates, including the builtin " +
				"daily/weekly/monthly templates. Returns ids usable as a report's templateId.",
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
}
