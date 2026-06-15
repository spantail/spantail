import type { ReportFilters } from "@toxil/core";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const PERIOD_UNITS = ["day", "week", "month", "custom"] as const;

import { user } from "./auth";
import { createdAtMs, workspaces } from "./domain";

const updatedAtMs = () =>
	integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull();

// Builtin templates are code-defined in @toxil/core, so every row here
// belongs to a workspace.
export const reportTemplates = sqliteTable(
	"report_templates",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		// Markdown + Liquid.
		body: text("body").notNull(),
		// Admin-controlled: disabled templates are hidden from the report tabs.
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		// Cadence used to default a report's period/name and the Duplicate step.
		periodUnit: text("period_unit", { enum: PERIOD_UNITS })
			.notNull()
			.default("custom"),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id),
		createdAt: createdAtMs(),
		updatedAt: updatedAtMs(),
	},
	(table) => [index("report_templates_workspace_idx").on(table.workspaceId)],
);

export const reports = sqliteTable(
	"reports",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		ownerUserId: text("owner_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Either a "builtin:*" id or a report_templates id; intentionally no FK.
		templateId: text("template_id").notNull(),
		// Always absolute: the report is a document for one fixed period.
		filters: text("filters", { mode: "json" }).$type<ReportFilters>().notNull(),
		// Free-form markdown rendered into the report output.
		note: text("note"),
		// The rendered document, produced on create and refreshed on edit.
		renderedMarkdown: text("rendered_markdown").notNull(),
		createdAt: createdAtMs(),
		updatedAt: updatedAtMs(),
	},
	(table) => [index("reports_owner_idx").on(table.ownerUserId)],
);
