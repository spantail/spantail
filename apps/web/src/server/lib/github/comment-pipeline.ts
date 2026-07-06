import {
	logWorkErrorReply,
	logWorkSuccessReply,
	notAMemberReply,
	onboardingReply,
	parseLogWorkArgs,
	resolveUserTimezone,
	tagSchema,
	unmappedRepoReply,
} from "@spantail/core";
import {
	createWorkEntryWithGithubRef,
	type Database,
	type GithubAppConfigRow,
	getGithubAppConfig,
	getGithubIdentityByGithubUserId,
	getGithubRepoMappingForRepo,
	getMembership,
	getUserById,
	getWorkEntryGithubRefByCommentId,
	sumWorkEntryMinutesForGithubIssue,
} from "@spantail/db";

import {
	createCommentReaction,
	createIssueComment,
	GithubApiError,
	getIssue,
} from "./api";
import { getInstallationToken } from "./app-auth";
import { resolveLinkableAgentEntries } from "./link-agent-entries";

/**
 * UC1: `@spantail <duration> [date]` in an issue/PR comment. Runs under
 * waitUntil after the webhook already answered 202 — all user feedback goes
 * through comment replies. Silence is deliberate for outsiders
 * (author_association gating, issue #159): an OSS repo must not become a
 * reply-spam surface.
 */

const COMMAND_PREFIX = "@spantail";

/** Associations trusted enough to receive replies (never `NONE` outsiders). */
const REPLYABLE_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export interface IssueCommentPayload {
	action?: string;
	comment?: {
		id: number;
		body?: string;
		author_association?: string;
		created_at?: string;
		user?: { id?: number; login?: string; type?: string };
	};
	issue?: { number?: number };
	repository?: { id?: number; full_name?: string };
	installation?: { id?: number };
}

export async function handleIssueCommentCreated(opts: {
	env: Env;
	db: Database;
	origin: string;
	config: GithubAppConfigRow;
	payload: IssueCommentPayload;
}): Promise<void> {
	const { env, db, origin, payload } = opts;
	try {
		if (payload.action !== "created") return;
		const comment = payload.comment;
		const issueNumber = payload.issue?.number;
		const repository = payload.repository;
		const installationId = payload.installation?.id;
		if (
			!comment?.body ||
			!comment.user?.id ||
			issueNumber === undefined ||
			!repository?.id ||
			!repository.full_name ||
			installationId === undefined
		) {
			return;
		}
		// Bots (including this App's own replies) never trigger commands.
		if (comment.user.type === "Bot") return;

		const body = comment.body.trim();
		if (!body.toLowerCase().startsWith(COMMAND_PREFIX)) return;
		const rawArgs = body.slice(COMMAND_PREFIX.length).trim();

		// Redelivery guard: this comment already produced an entry.
		if (await getWorkEntryGithubRefByCommentId(db, comment.id)) return;

		const canReply = REPLYABLE_ASSOCIATIONS.has(
			comment.author_association ?? "",
		);
		const reply = async (message: string) => {
			const config = await getGithubAppConfig(db);
			if (!config) return;
			const token = await getInstallationToken(
				env.BETTER_AUTH_SECRET,
				config,
				installationId,
			);
			await createIssueComment(
				token,
				repository.full_name as string,
				issueNumber,
				message,
			);
		};

		const mapping = await getGithubRepoMappingForRepo(db, {
			repoId: repository.id,
			fullName: repository.full_name,
		});
		if (!mapping) {
			if (canReply) {
				await reply(
					unmappedRepoReply(
						repository.full_name,
						`${origin}/settings/integrations`,
					),
				);
			}
			return;
		}

		const identity = await getGithubIdentityByGithubUserId(db, comment.user.id);
		if (!identity) {
			// Onboarding only for repo insiders; outsiders get no reaction at all.
			if (canReply) {
				await reply(onboardingReply(`${origin}/api/github/connect`));
			}
			return;
		}

		const membership = await getMembership(
			db,
			mapping.workspaceId,
			identity.userId,
		);
		if (!membership) {
			if (canReply) await reply(notAMemberReply());
			return;
		}

		const user = await getUserById(db, identity.userId);
		if (!user) return;

		const parsed = parseLogWorkArgs(rawArgs, {
			timeZone: resolveUserTimezone(user.timezone),
			now: comment.created_at ? new Date(comment.created_at) : undefined,
		});
		if (!parsed.ok) {
			if (canReply) await reply(logWorkErrorReply(parsed.error));
			return;
		}

		// Issue title/labels enrich the entry; failures degrade to the bare ref
		// (the log itself must never depend on a second GitHub call).
		const token = await getInstallationToken(
			env.BETTER_AUTH_SECRET,
			opts.config,
			installationId,
		);
		let description = `${repository.full_name}#${issueNumber}`;
		let tags: string[] = [];
		try {
			const issue = await getIssue(token, repository.full_name, issueNumber);
			description = `${issue.title} (#${issueNumber})`;
			tags = issue.labels
				.map((label) => label.name)
				.filter((name) => tagSchema.safeParse(name).success)
				.slice(0, 20);
		} catch (error) {
			if (!(error instanceof GithubApiError)) throw error;
		}

		const agentEntryIds = await resolveLinkableAgentEntries({
			db,
			userId: identity.userId,
			workspaceId: mapping.workspaceId,
			repoFullName: mapping.repoFullName,
			issueNumber,
			installationToken: token,
		});

		try {
			await createWorkEntryWithGithubRef(
				db,
				{
					workspaceId: mapping.workspaceId,
					projectId: mapping.projectId,
					userId: identity.userId,
					entryDate: parsed.entryDate,
					durationMinutes: parsed.durationMinutes,
					startedAt: null,
					endedAt: null,
					description,
					note: `https://github.com/${mapping.repoFullName}/issues/${issueNumber}`,
					tags,
					source: "github",
				},
				{
					repoFullName: mapping.repoFullName,
					issueNumber,
					commentId: comment.id,
				},
				agentEntryIds,
			);
		} catch {
			// Unique violation on comment_id: a redelivery raced the pre-check.
			return;
		}

		const totalMinutes = await sumWorkEntryMinutesForGithubIssue(
			db,
			mapping.repoFullName,
			issueNumber,
		);
		// Feedback is best-effort: the entry exists even if GitHub rejects the
		// reaction or reply.
		try {
			await createCommentReaction(
				token,
				repository.full_name,
				comment.id,
				"+1",
			);
			await reply(
				logWorkSuccessReply({
					durationMinutes: parsed.durationMinutes,
					entryDate: parsed.entryDate,
					totalMinutes,
				}),
			);
		} catch (error) {
			console.error("github feedback failed", error);
		}
	} catch (error) {
		// Never guess a reply on unexpected failures; GitHub already got 202.
		console.error("github comment pipeline failed", error);
	}
}
