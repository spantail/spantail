import type {
	ReportDateRange,
	ReportFilters,
	ReportFiltersInput,
} from "@spantail/core";
import { absoluteDateRangeSchema, dateRangePresetSchema } from "@spantail/core";
import type { SpantailClient } from "@spantail/sdk";

import type { CliContext } from "./context";
import { CliError, UsageError } from "./errors";
import {
	requireWorkspaceSlug,
	resolveProject,
	resolveUsers,
	resolveWorkspace,
} from "./resolve";

/** CLI preset spellings (hyphenated) mapped from the wire enum (underscored). */
export const RANGE_PRESETS = dateRangePresetSchema.options.map((preset) =>
	preset.replaceAll("_", "-"),
);

/** parseArgs options shared by `report create`, `report preview`, `report edit`. */
export const REPORT_FILTER_OPTIONS = {
	workspace: { type: "string" },
	"all-workspaces": { type: "boolean" },
	project: { type: "string", multiple: true },
	user: { type: "string", multiple: true },
	tag: { type: "string", multiple: true },
	range: { type: "string" },
	from: { type: "string" },
	to: { type: "string" },
} as const;

export interface ReportFilterFlags {
	workspace?: string;
	"all-workspaces"?: boolean;
	project?: string[];
	user?: string[];
	tag?: string[];
	range?: string;
	from?: string;
	to?: string;
}

export const REPORT_FILTER_FLAGS_HELP = `  --workspace <slug>     Single-workspace scope (default: the configured default workspace)
  --all-workspaces       Instance scope: every workspace you belong to
  --project <slug>       Only entries of this project; repeatable (needs a workspace scope)
  --user <id-or-email>   Only entries by this user; repeatable (id only with --all-workspaces)
  --tag <tag>            Only entries carrying this tag; repeatable
  --range <preset>       Relative period: ${RANGE_PRESETS.join(", ")}
                         (resolved in your timezone when the report renders)
  --from/--to <date>     Absolute period YYYY-MM-DD (both required; excludes --range)`;

/**
 * Builds the create/update wire filters from CLI flags. With `base` (editing),
 * omitted flags keep the report's current values; without it, the workspace
 * falls back to the configured default and the range to `fallbackRange`.
 */
export async function buildReportFilters(
	client: SpantailClient,
	ctx: CliContext,
	flags: ReportFilterFlags,
	options: { base?: ReportFilters; fallbackRange?: ReportDateRange } = {},
): Promise<ReportFiltersInput> {
	const { base } = options;
	const allWorkspaces = flags["all-workspaces"] === true;
	if (allWorkspaces && flags.workspace) {
		throw new UsageError(
			"--workspace and --all-workspaces are mutually exclusive",
		);
	}
	if (flags.range && (flags.from || flags.to)) {
		throw new UsageError("--range and --from/--to are mutually exclusive");
	}
	if ((flags.from === undefined) !== (flags.to === undefined)) {
		throw new UsageError("--from and --to must be given together");
	}

	let dateRange: ReportDateRange;
	if (flags.range) {
		const preset = dateRangePresetSchema.safeParse(
			flags.range.replaceAll("-", "_"),
		);
		if (!preset.success) {
			throw new UsageError(
				`invalid --range "${flags.range}"; use one of: ${RANGE_PRESETS.join(", ")}`,
			);
		}
		dateRange = preset.data;
	} else if (flags.from && flags.to) {
		const absolute = absoluteDateRangeSchema.safeParse({
			from: flags.from,
			to: flags.to,
		});
		if (!absolute.success) {
			throw new UsageError(
				`invalid --from/--to: ${absolute.error.issues[0]?.message ?? "use YYYY-MM-DD"}`,
			);
		}
		dateRange = absolute.data;
	} else {
		dateRange = base?.dateRange ?? options.fallbackRange ?? "today";
	}

	// Workspace scope: an explicit flag wins; editing keeps the report's scope;
	// otherwise the configured default workspace applies (as everywhere else).
	let workspaceIds: string[];
	let workspace: { id: string; slug: string } | undefined;
	if (allWorkspaces) {
		workspaceIds = [];
	} else if (flags.workspace) {
		workspace = await resolveWorkspace(client, flags.workspace);
		workspaceIds = [workspace.id];
	} else if (base) {
		if (base.workspaceIds.length > 1) {
			throw new UsageError(
				"this report has a legacy multi-workspace scope; pass --workspace <slug> or --all-workspaces",
			);
		}
		workspaceIds = base.workspaceIds;
	} else {
		workspace = await resolveWorkspace(
			client,
			requireWorkspaceSlug(ctx, undefined),
		);
		workspaceIds = [workspace.id];
	}

	// Resolving project slugs and user emails needs the workspace object; when
	// the scope was inherited from `base` only its id is known, so look it up.
	const requireWorkspaceObject = async () => {
		if (workspace) return workspace;
		const id = workspaceIds[0];
		if (id === undefined) {
			throw new UsageError(
				"--project and user emails need a workspace scope; pass --workspace <slug>",
			);
		}
		const match = (await client.listWorkspaces()).find((ws) => ws.id === id);
		if (!match) {
			throw new CliError(
				"you are no longer a member of this report's workspace; pass --workspace <slug> or --all-workspaces",
			);
		}
		workspace = match;
		return match;
	};

	let projectIds: string[] | undefined;
	if (flags.project?.length) {
		if (workspaceIds.length !== 1) {
			throw new UsageError(
				"--project requires a workspace scope (not --all-workspaces)",
			);
		}
		const ws = await requireWorkspaceObject();
		projectIds = [];
		for (const slug of flags.project) {
			projectIds.push((await resolveProject(client, ws, slug)).id);
		}
	} else if (base?.projectIds?.length) {
		// A kept project filter only makes sense in the workspace it belongs to.
		if (workspaceIds[0] === base.workspaceIds[0]) {
			projectIds = base.projectIds;
		} else {
			ctx.stderr.write(
				"note: cleared the project filter (workspace scope changed)\n",
			);
		}
	}

	let userIds: string[] | undefined;
	if (flags.user?.length) {
		if (workspaceIds.length === 1) {
			const ws = await requireWorkspaceObject();
			userIds = (await resolveUsers(client, ws, flags.user)).map(
				(member) => member.userId,
			);
		} else {
			const email = flags.user.find((value) => value.includes("@"));
			if (email) {
				throw new UsageError(
					`--user "${email}": emails need a workspace scope; pass a user id with --all-workspaces`,
				);
			}
			userIds = flags.user;
		}
	} else {
		userIds = base?.userIds;
	}

	return {
		workspaceIds,
		projectIds,
		userIds,
		tags: flags.tag ?? base?.tags,
		dateRange,
	};
}
