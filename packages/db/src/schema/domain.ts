import { workSpanSources } from "@spantail/core";
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const createdAtMs = () =>
	integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull();

export const workspaces = sqliteTable("workspaces", {
	id: text("id").primaryKey(),
	slug: text("slug").notNull().unique(),
	name: text("name").notNull(),
	timezone: text("timezone").notNull(),
	accentColor: text("accent_color").notNull().default("neutral"),
	// App-relative URL of the workspace logo served from R2, with a cache-busting
	// "?v=" version. Null when no logo is set.
	logoUrl: text("logo_url"),
	settings: text("settings", { mode: "json" })
		.$type<Record<string, unknown>>()
		.notNull()
		.default({}),
	createdAt: createdAtMs(),
	archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
});

export const workspaceMembers = sqliteTable(
	"workspace_members",
	{
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
		createdAt: createdAtMs(),
	},
	(table) => [
		primaryKey({ columns: [table.workspaceId, table.userId] }),
		index("workspace_members_user_idx").on(table.userId),
	],
);

export const projects = sqliteTable(
	"projects",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		// Color marker (OKLCH hue 0–359). Always set; the create form picks one
		// and this default covers rows created without an explicit color.
		hue: integer("hue").notNull().default(264),
		status: text("status", { enum: ["active", "archived"] })
			.notNull()
			.default("active"),
		createdAt: createdAtMs(),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		uniqueIndex("projects_workspace_slug_uq").on(table.workspaceId, table.slug),
	],
);

export const workSpans = sqliteTable(
	"work_spans",
	{
		id: text("id").primaryKey(),
		// Denormalized workspace id keeps every query scoped by membership cheap.
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		// Nullable: deleting a project sets this to null rather than cascading,
		// so the work history is preserved as un-assigned spans.
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "set null",
		}),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Local date (YYYY-MM-DD) in the workspace's timezone.
		spanDate: text("span_date").notNull(),
		durationMinutes: integer("duration_minutes").notNull(),
		startedAt: integer("started_at", { mode: "timestamp_ms" }),
		endedAt: integer("ended_at", { mode: "timestamp_ms" }),
		description: text("description").notNull(),
		note: text("note"),
		tags: text("tags", { mode: "json" })
			.$type<string[]>()
			.notNull()
			.default([]),
		// Client channel the span was created through (web/cli/mcp/api).
		source: text("source", { enum: workSpanSources }).notNull().default("web"),
		createdAt: createdAtMs(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("work_spans_workspace_date_idx").on(
			table.workspaceId,
			table.spanDate,
		),
		index("work_spans_project_idx").on(table.projectId),
		index("work_spans_user_idx").on(table.userId),
	],
);
