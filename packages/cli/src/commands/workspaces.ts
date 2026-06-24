import { parseArgs } from "node:util";

import { createClient, requireConnection } from "../client";
import type { CliContext } from "../context";
import { formatTable } from "../output";

const USAGE = `Usage: spantail workspaces list

Lists the workspaces you belong to.
`;

export async function workspacesList(
	args: string[],
	ctx: CliContext,
): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { help: { type: "boolean", short: "h" } },
	});
	if (values.help) {
		ctx.stdout.write(USAGE);
		return 0;
	}

	const client = createClient(ctx, requireConnection(ctx));
	const workspaces = await client.listWorkspaces();
	if (workspaces.length === 0) {
		ctx.stderr.write("No workspaces.\n");
		return 0;
	}
	ctx.stdout.write(
		`${formatTable(
			["SLUG", "NAME", "ROLE", "TIMEZONE"],
			workspaces.map((ws) => [ws.slug, ws.name, ws.role, ws.timezone]),
		)}\n`,
	);
	return 0;
}
