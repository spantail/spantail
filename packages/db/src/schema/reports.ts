import type { ReportFilters } from "@spantail/core";
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAtMs } from "./domain";

const updatedAtMs = () =>
	integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull();

// Templates are instance-scoped presentation formats: a report picks one
// freely, independent of which workspaces/projects/period it covers. A fresh
// instance is seeded with a default template from @spantail/templates.
export const reportTemplates = sqliteTable(
	"report_templates",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		description: text("description"),
		// Markdown + Liquid.
		body: text("body").notNull(),
		// Admin-controlled: disabled templates are hidden from the report tabs.
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		// Exactly one template is the instance default: at most one at the DB level
		// (the partial unique index below), at least one in the app layer (the lazy
		// seed and the first-create fallback). It is the compose dialog's fallback
		// pick and cannot be deleted or disabled.
		isDefault: integer("is_default", { mode: "boolean" })
			.notNull()
			.default(false),
		// Liquid producing a report's initial name/note at compose time. Rendered
		// server-side with a scope-only context (no entries). Null falls back to no
		// suggestion.
		nameTemplate: text("name_template"),
		noteTemplate: text("note_template"),
		// Default relative range a new report seeds with at compose time (a
		// DateRangePreset value). Null falls back to "today" in the compose dialog.
		defaultDateRange: text("default_date_range"),
		// Nullable + set null on delete: keep the template when its author is
		// removed (authorship is just dropped).
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: createdAtMs(),
		updatedAt: updatedAtMs(),
	},
	(table) => [
		// Guarantees at most one default per instance: a partial unique index over
		// the truthy flag allows any number of is_default = 0 rows but only a single
		// is_default = 1, so concurrent writers can never leave two defaults.
		uniqueIndex("report_templates_one_default")
			.on(table.isDefault)
			.where(sql`${table.isDefault} = 1`),
	],
);

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
		// A report_templates id; intentionally no FK so a report survives its
		// template being deleted (the rendered document is already frozen).
		templateId: text("template_id").notNull(),
		// Always absolute: the report is a document for one fixed period.
		filters: text("filters", { mode: "json" }).$type<ReportFilters>().notNull(),
		// Free-form markdown rendered into the report output. Held here (current,
		// for seeding the edit form) and snapshotted onto each content version;
		// kept out of the content front-matter because it is long/multi-line.
		note: text("note"),
		// Total logged minutes across the report's entries of the current version.
		// Nullable: reports created before this column show no total until re-rendered.
		totalMinutes: integer("total_minutes"),
		// Distinct project ids whose entries appear in the current snapshot, captured
		// at render time. Drives the Send-to ACL: a recipient must be able to read
		// every one of these projects. Frozen with the content, so it stays correct
		// even if the owner later loses access or the source entries change.
		// Nullable = unknown scope (a report rendered before this column existed):
		// Send-to is blocked until the report is re-rendered, since the frozen body
		// may contain project-scoped data we can no longer enumerate. An empty array
		// means "rendered, no project-assigned entries" — no restriction.
		snapshotProjectIds: text("snapshot_project_ids", {
			mode: "json",
		}).$type<string[]>(),
		// The workspace set the current snapshot was rendered against, captured at
		// render time. Bounds the Send-to / share ACL together with
		// snapshotProjectIds: dissemination stays scoped to this frozen set (and the
		// owner must still cover it), so it is stable even when the stored filter
		// carries no workspaces (instance scope stores an empty `filters.workspaceIds`)
		// or the owner's live memberships change. Nullable = a report rendered before
		// this column existed: fall back to `filters.workspaceIds`, which for those
		// reports holds the resolved set.
		snapshotWorkspaceIds: text("snapshot_workspace_ids", {
			mode: "json",
		}).$type<string[]>(),
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
// source entries, but the current one never does.
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
