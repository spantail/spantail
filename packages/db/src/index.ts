import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function createDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;

export { authOptions } from "./auth-options";
export * from "./queries/agents";
export * from "./queries/discussions";
export * from "./queries/entry-access";
export * from "./queries/github";
export * from "./queries/instance";
export * from "./queries/invitations";
export * from "./queries/members";
export * from "./queries/project-members";
export * from "./queries/projects";
export * from "./queries/report-deliveries";
export * from "./queries/report-shares";
export * from "./queries/report-templates";
export * from "./queries/reports";
export * from "./queries/search";
export * from "./queries/tokens";
export * from "./queries/users";
export * from "./queries/work-entries";
export * from "./queries/workspaces";
export * as schema from "./schema";
