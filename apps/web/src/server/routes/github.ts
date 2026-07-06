import {
	logWorkErrorReply,
	logWorkFromGithubInputSchema,
	parseLogWorkArgs,
	repoFullNameFromUrl,
	resolveUserTimezone,
	tagSchema,
	unmappedRepoReply,
	type WorkEntrySource,
} from "@spantail/core";
import {
	createWorkEntryWithGithubRef,
	getGithubAppConfig,
	getGithubRepoMappingByFullName,
	getProjectById,
	listGithubInstallations,
} from "@spantail/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { GithubApiError, getIssue } from "../lib/github/api";
import { getInstallationToken } from "../lib/github/app-auth";
import { resolveLinkableAgentEntries } from "../lib/github/link-agent-entries";
import {
	requireProjectAccess,
	requireWorkspaceAccess,
} from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import { ingestRateLimit } from "../middleware/rate-limit";
import { publishToWorkspace } from "../realtime/publish";
import type { AppEnv } from "../types";

function resolveSource(c: Context<AppEnv>): WorkEntrySource {
	if (c.var.auth?.via === "session") return "web";
	const hint = c.req.header("x-spantail-client");
	if (hint === "cli" || hint === "mcp") return hint;
	return "api";
}

/**
 * UC2: log work against a GitHub issue from a client that only knows its git
 * remotes (issue #159). The server owns everything the client must not:
 * remote→repo normalization, the repo→project mapping, command parsing in
 * the caller's timezone, issue enrichment, and agent-session linking.
 */
export const githubRoutes = new Hono<AppEnv>().post(
	"/log-work",
	ingestRateLimit,
	async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(logWorkFromGithubInputSchema, await c.req.json());
		const origin = new URL(c.req.url).origin;

		// Normalize remotes preserving order: the first mapped repo wins, which
		// makes fork/multi-remote resolution deterministic.
		const fullNames: string[] = [];
		for (const remote of input.remotes) {
			const fullName = repoFullNameFromUrl(remote);
			if (fullName && !fullNames.includes(fullName)) fullNames.push(fullName);
		}
		if (fullNames.length === 0) {
			throw new AppError(
				"bad_request",
				"None of the given remotes is a github.com repository",
			);
		}

		let mapping = null;
		for (const fullName of fullNames) {
			mapping = await getGithubRepoMappingByFullName(c.var.db, fullName);
			if (mapping) break;
		}
		if (!mapping) {
			throw new AppError(
				"not_found",
				unmappedRepoReply(
					fullNames[0] ?? "",
					`${origin}/settings/integrations`,
				),
			);
		}

		const { membership } = await requireWorkspaceAccess(c, mapping.workspaceId);
		await requireProjectAccess(c, mapping.projectId, membership, user.id);
		const project = await getProjectById(c.var.db, mapping.projectId);
		if (!project) throw new AppError("not_found", "Project not found");

		const parsed = parseLogWorkArgs(input.args, {
			timeZone: resolveUserTimezone(user.timezone),
		});
		if (!parsed.ok) {
			throw new AppError("bad_request", logWorkErrorReply(parsed.error));
		}

		// Enrichment is best-effort: no App, no covering installation, or a
		// failing GitHub API all degrade to the bare issue reference.
		const issueUrl = `https://github.com/${mapping.repoFullName}/issues/${input.issueNumber}`;
		let installationToken: string | null = null;
		let title: string | null = null;
		let tags: string[] = [];
		const config = await getGithubAppConfig(c.var.db);
		if (config) {
			// Mappings without an installation id (older/manual rows): prefer the
			// installation owned by the repo's owner — in multi-installation
			// instances the first unsuspended one may not cover this repo at all.
			const repoOwner = mapping.repoFullName.split("/")[0] ?? "";
			const active = (await listGithubInstallations(c.var.db)).filter(
				(row) => row.suspendedAt === null,
			);
			const installationId =
				mapping.installationId ??
				(
					active.find((row) => row.accountLogin.toLowerCase() === repoOwner) ??
					active[0]
				)?.installationId;
			if (installationId !== undefined) {
				try {
					installationToken = await getInstallationToken(
						c.env.BETTER_AUTH_SECRET,
						config,
						installationId,
					);
					const issue = await getIssue(
						installationToken,
						mapping.repoFullName,
						input.issueNumber,
					);
					title = issue.title;
					tags = issue.labels
						.map((label) => label.name)
						.filter((name) => tagSchema.safeParse(name).success)
						.slice(0, 20);
				} catch (error) {
					// Any failure — HTTP status, network reject, bad JSON — degrades
					// to the bare issue reference; the log itself must not depend on
					// GitHub being reachable.
					if (!(error instanceof GithubApiError)) {
						console.error("github issue enrichment failed", error);
					}
				}
			}
		}

		const agentEntryIds = await resolveLinkableAgentEntries({
			db: c.var.db,
			userId: user.id,
			workspaceId: mapping.workspaceId,
			repoFullName: mapping.repoFullName,
			issueNumber: input.issueNumber,
			installationToken,
		});

		const entry = await createWorkEntryWithGithubRef(
			c.var.db,
			{
				workspaceId: mapping.workspaceId,
				projectId: mapping.projectId,
				userId: user.id,
				entryDate: parsed.entryDate,
				durationMinutes: parsed.durationMinutes,
				startedAt: null,
				endedAt: null,
				description:
					title === null
						? `#${input.issueNumber}`
						: `${title} (#${input.issueNumber})`,
				note: issueUrl,
				tags,
				source: resolveSource(c),
			},
			{
				repoFullName: mapping.repoFullName,
				issueNumber: input.issueNumber,
				commentId: null,
			},
			agentEntryIds,
		);
		publishToWorkspace(c, {
			type: "work-entry",
			workspaceId: mapping.workspaceId,
		});

		return c.json(
			{
				entry,
				resolved: {
					repo: mapping.repoFullName,
					workspaceId: mapping.workspaceId,
					projectId: mapping.projectId,
					projectName: project.name,
					issue: { number: input.issueNumber, title, url: issueUrl },
					tags,
					linkedAgentEntryIds: agentEntryIds,
					degraded: title === null,
				},
			},
			201,
		);
	},
);
