import type {
	Project,
	Recipient,
	WorkspaceMember,
	WorkspaceWithRole,
} from "@spantail/core";
import type { SpantailClient } from "@spantail/sdk";

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
			"no workspace selected; pass --workspace <slug> or set a default with `spantail auth login`",
		);
	}
	return slug;
}

/** The API references workspaces by id; the CLI accepts slugs and looks up. */
export async function resolveWorkspace(
	client: SpantailClient,
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

/** Resolves each user id or email against the workspace's member list. */
export async function resolveUsers(
	client: SpantailClient,
	workspace: Pick<WorkspaceWithRole, "id" | "slug">,
	idsOrEmails: string[],
): Promise<WorkspaceMember[]> {
	const members = await client.listMembers(workspace.id);
	return idsOrEmails.map((value) => {
		const match = members.find(
			(member) => member.userId === value || member.email === value,
		);
		if (!match) {
			const available =
				members.map((member) => member.email).join(", ") || "none";
			throw new CliError(
				`unknown user "${value}" in workspace "${workspace.slug}" (available: ${available})`,
			);
		}
		return match;
	});
}

/** Resolves each user id or email against a report's candidate recipients. */
export async function resolveRecipients(
	client: SpantailClient,
	reportId: string,
	idsOrEmails: string[],
): Promise<Recipient[]> {
	const recipients = await client.listReportRecipients(reportId);
	return idsOrEmails.map((value) => {
		const match = recipients.find(
			(recipient) => recipient.id === value || recipient.email === value,
		);
		if (!match) {
			const available =
				recipients.map((recipient) => recipient.email).join(", ") || "none";
			throw new CliError(
				`unknown recipient "${value}" (available: ${available})`,
			);
		}
		return match;
	});
}

export async function resolveProject(
	client: SpantailClient,
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
