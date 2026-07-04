import { readFile } from "node:fs/promises";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpantailClient } from "@spantail/sdk";
import { runTool } from "@spantail/sdk/mcp";
import { z } from "zod";

import { importEntries } from "./import-entries";

/**
 * Tools only the stdio server offers: they read the local filesystem, which
 * does not exist for the remote /mcp Worker endpoint.
 */
export function registerStdioTools(
	server: McpServer,
	client: SpantailClient,
): void {
	server.registerTool(
		"import_work_entries",
		{
			title: "Import work entries from a JSONL file",
			description:
				"Bulk-import work entries from a local JSONL file (one JSON object per " +
				"line: entryDate, durationMinutes, description, and optional project " +
				"slug, note, tags, startedAt, endedAt, externalId). The whole file is " +
				"validated before anything is sent; entries are then posted in atomic " +
				"batches of 1000. An externalId becomes the entry's id, so re-importing " +
				"the same file updates those entries instead of duplicating them.",
			inputSchema: {
				file: z.string().describe("Path to the JSONL file"),
				workspace: z.string().describe("Workspace slug"),
				project: z
					.string()
					.optional()
					.describe('Default project slug for lines without a "project" field'),
			},
		},
		({ file, workspace, project }) =>
			runTool(async () => {
				const content = await readFile(file, "utf8");
				const summary = await importEntries(client, {
					workspaceSlug: workspace,
					defaultProjectSlug: project,
					content,
				});
				return {
					imported: summary.imported,
					requests: summary.requests,
					workspace: summary.workspace,
				};
			}),
	);
}
