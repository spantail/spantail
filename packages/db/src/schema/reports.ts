import type { ReportFilters } from "@spantail/core";
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

const PERIOD_UNITS = ["day", "week", "month", "custom"] as const;

import { user } from "./auth";
import { createdAtMs } from "./domain";

const updatedAtMs = () =>
	integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull();

// Templates are instance-scoped presentation formats: a report picks one
// freely, independent of which workspaces/projects/period it covers. Builtin
// templates are code-defined in @spantail/core; these rows are the custom ones.
export const reportTemplates = sqliteTable("report_templates", {
	id: text("id").primaryKey(),
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
	// Nullable + set null on delete: keep the template when its author is
	// removed (authorship is just dropped).
	createdBy: text("created_by").references(() => user.id, {
		onDelete: "set null",
	}),
	createdAt: createdAtMs(),
	updatedAt: updatedAtMs(),
});

// A report is a mutable header: the current, queryable state (template, filters,
// note, totals) that the list/tabs group by and the compose dialog seeds from.
// Each edit re-renders and appends an immutable report_content version; `version`
// points at the latest (current) one.
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
		// Free-form markdown rendered into the report output. Held here (current,
		// for seeding the edit form) and snapshotted onto each content version;
		// kept out of the content front-matter because it is long/multi-line.
		note: text("note"),
		// Total logged minutes across the report's spans of the current version.
		// Nullable: reports created before this column show no total until re-rendered.
		totalMinutes: integer("total_minutes"),
		// The current version number; 1 at creation, incremented on each edit.
		version: integer("version").notNull().default(1),
		createdAt: createdAtMs(),
		updatedAt: updatedAtMs(),
	},
	(table) => [index("reports_owner_idx").on(table.ownerUserId)],
);

// An immutable, versioned snapshot of a report's rendered document. Each
// create/edit appends one row (version 1, 2, …); the current version is the
// latest. `content` is self-describing Markdown: a system-generated YAML
// front-matter header (filters, period, totals, …) followed by the rendered
// body. Send/Share copy a content version; older versions may drift from the
// source spans, but the current one never does.
export const reportContent = sqliteTable(
	"report_content",
	{
		id: text("id").primaryKey(),
		reportId: text("report_id")
			.notNull()
			.references(() => reports.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		// Front-matter + rendered Markdown body.
		content: text("content").notNull(),
		// Per-version snapshot of the note (duplicated from the header on purpose:
		// note is long/multi-line and awkward to round-trip through front-matter).
		note: text("note"),
		createdAt: createdAtMs(),
	},
	(table) => [
		uniqueIndex("report_content_report_version_idx").on(
			table.reportId,
			table.version,
		),
		index("report_content_report_idx").on(table.reportId),
	],
);
