import type { Project, WorkspaceWithRole } from "@toxil/core";
import type { ToxilClient } from "@toxil/sdk";

import { loadConfig } from "./config";
import type { CliContext } from "./context";
import { CliError, UsageError } from "./errors";

/** The workspace slug to operate on: --workspace flag > configured default. */
export function requireWorkspaceSlug(
	ctx: CliContext,
	flag: string | undefined,
): string {
	if (flag) return flag;
	const slug = loadConfig(ctx.configDir)?.defaultWorkspace;
	if (!slug) {
		throw new UsageError(
			"no workspace selected; pass --workspace <slug> or set a default with `toxil auth login`",
		);
	}
	return slug;
}

/** The API references workspaces by id; the CLI accepts slugs and looks up. */
export async function resolveWorkspace(
	client: ToxilClient,
	slug: string,
): Promise<WorkspaceWithRole> {
	const workspaces = await client.listWorkspaces();
	const match = workspaces.find((ws) => ws.slug === slug);
	if (!match) {
		const available = workspaces.map((ws) => ws.slug).join(", ") || "none";
		throw new CliError(`unknown workspace "${slug}" (available: ${available})`);
	}
	return match;
}

export async function resolveProject(
	client: ToxilClient,
	workspace: Pick<WorkspaceWithRole, "id" | "slug">,
	slug: string,
): Promise<Project> {
	const projects = await client.listProjects(workspace.id);
	const match = projects.find((project) => project.slug === slug);
	if (!match) {
		const available =
			projects.map((project) => project.slug).join(", ") || "none";
		throw new CliError(
			`unknown project "${slug}" in workspace "${workspace.slug}" (available: ${available})`,
		);
	}
	return match;
}
