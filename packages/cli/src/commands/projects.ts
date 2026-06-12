import { parseArgs } from "node:util";

import { createClient, requireConnection } from "../client";
import type { CliContext } from "../context";
import { formatTable } from "../output";
import { requireWorkspaceSlug, resolveWorkspace } from "../resolve";

const USAGE = `Usage: toxil projects list [options]

Lists the projects in a workspace.

Options:
  --workspace <slug>   Workspace (default: the configured default workspace)
  -h, --help           Show this help
`;

export async function projectsList(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			workspace: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		ctx.stdout.write(USAGE);
		return 0;
	}

	const client = createClient(ctx, requireConnection(ctx));
	const slug = requireWorkspaceSlug(ctx, values.workspace);
	const workspace = await resolveWorkspace(client, slug);
	const projects = await client.listProjects(workspace.id);
	if (projects.length === 0) {
		ctx.stderr.write(`No projects in workspace "${workspace.slug}".\n`);
		return 0;
	}
	ctx.stdout.write(
		`${formatTable(
			["SLUG", "NAME", "STATUS"],
			projects.map((project) => [project.slug, project.name, project.status]),
		)}\n`,
	);
	return 0;
}
