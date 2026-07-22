import {
	type AgentEntry,
	type AgentType,
	formatDuration,
	type Project,
	parseGithubRef,
	repoUrlFromFullName,
	todayInTimezone,
} from "@spantail/core";
import {
	CalendarIcon,
	ChevronRightIcon,
	ClockIcon,
	FolderGitIcon,
	FolderIcon,
	GitBranchIcon,
	GitPullRequestIcon,
	HashIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AgentTypeIcon } from "@/components/agent-icon";
import { ProjectMarker } from "@/components/project-marker";
import { GitHubIcon } from "@/components/provider-icons";
import { formatClock, formatCompactNumber, formatDay } from "@/lib/format";

interface AgentEntryDetailProps {
	entry: AgentEntry;
	/** The agent's kind, for the model row's brand icon (e.g. Claude). */
	agentType: AgentType;
	/** Resolved project for the marker; undefined when unassigned. */
	project?: Project;
	/** Display name for the entry's project (already resolved by the caller). */
	projectName: string;
	timezone: string;
}

/**
 * Read-only body of one captured agent session: a metadata panel (project /
 * date / duration), a usage card (model, an Events / Active / Tokens stat strip,
 * the input/output split, and the per-bucket token breakdown), the aggregated
 * context as link-style cards, and the session id. Agent sessions are ingested,
 * never edited, so there are no actions.
 */
export function AgentEntryDetail({
	entry,
	agentType,
	project,
	projectName,
	timezone,
}: AgentEntryDetailProps) {
	const { t, i18n } = useTranslation();
	const today = todayInTimezone(timezone);

	const dateLabel = formatDay(entry.entryDate, i18n.language, { now: today });
	const timeRange =
		entry.startedAt && entry.endedAt
			? `${formatClock(entry.startedAt, timezone)}–${formatClock(entry.endedAt, timezone)}`
			: null;

	const usage = entry.usage;
	const inputTokens = usage?.inputTokens;
	const outputTokens = usage?.outputTokens;
	// Only show the split when BOTH buckets are known: a source may expose one
	// and not the other, and treating a missing bucket as 0 would misrender an
	// unknown split as a definite 100/0.
	const hasTokenSplit =
		inputTokens !== undefined &&
		outputTokens !== undefined &&
		inputTokens + outputTokens > 0;
	const inputPercent = hasTokenSplit
		? Math.round((inputTokens / (inputTokens + outputTokens)) * 100)
		: 0;

	const context = entry.context;
	// The session's model: usage carries it when the source exposes usage;
	// otherwise fall back to the context facet (e.g. a summary-path session with
	// no usage), so the model line never disappears when the data is available.
	const contextModels = context?.models ?? [];
	const model =
		usage?.model ??
		(contextModels.length === 0
			? null
			: contextModels.length === 1
				? contextModels[0]
				: `${contextModels[0]} +${contextModels.length - 1}`);

	return (
		<div className="flex flex-col gap-5">
			<div className="bg-muted/40 grid grid-cols-1 gap-4 rounded-xl border p-4 sm:grid-cols-3">
				<MetaItem
					icon={<FolderIcon className="size-3.5" />}
					label={t("agents.table.project")}
					value={
						project ? (
							<span className="flex items-center gap-1.5">
								<ProjectMarker hue={project.hue} symbol={project.symbol} />
								{projectName}
							</span>
						) : (
							projectName
						)
					}
				/>
				<MetaItem
					icon={<CalendarIcon className="size-3.5" />}
					label={t("agents.table.date")}
					value={dateLabel}
				/>
				<MetaItem
					icon={<ClockIcon className="size-3.5" />}
					label={t("agents.table.duration")}
					value={
						<span className="flex flex-wrap items-baseline gap-x-1.5">
							<span className="tabular-nums">
								{formatDuration(entry.durationMinutes)}
							</span>
							{timeRange && (
								<span className="text-muted-foreground text-xs font-normal tabular-nums">
									{timeRange}
								</span>
							)}
						</span>
					}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<MetaLabel>{t("agents.detail.usage")}</MetaLabel>
				<div className="bg-muted/40 flex flex-col gap-4 rounded-xl border p-4">
					{/* identity: model (agent name is redundant on the agent's own page) */}
					{model && (
						<div className="flex items-center gap-2.5">
							<span className="bg-brand/12 text-brand flex size-8 shrink-0 items-center justify-center rounded-lg">
								<AgentTypeIcon type={agentType} className="size-4" />
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
									{t("agents.table.model")}
								</p>
								<p className="truncate font-mono text-[13px] font-medium">
									{model}
								</p>
							</div>
						</div>
					)}

					{/* stat strip */}
					<div className="divide-border flex divide-x">
						<AgentStat
							label={t("agents.detail.events")}
							value={
								entry.eventCount != null
									? formatCompactNumber(entry.eventCount)
									: "—"
							}
						/>
						<AgentStat
							label={t("agents.detail.active")}
							value={formatDuration(
								entry.activeDurationMinutes ?? entry.durationMinutes,
							)}
						/>
						<AgentStat
							label={t("agents.detail.tokens")}
							value={usage ? formatCompactNumber(usage.totalTokens) : "—"}
						/>
					</div>

					{/* input / output token split — only when a breakdown exists */}
					{hasTokenSplit && (
						<div className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between text-[11px] tabular-nums">
								<span className="text-muted-foreground flex items-center gap-1.5">
									<span className="bg-foreground/25 size-2 rounded-full" />
									{t("agents.table.input")}{" "}
									<span className="text-foreground font-medium">
										{formatCompactNumber(inputTokens ?? 0)}
									</span>
								</span>
								<span className="text-muted-foreground flex items-center gap-1.5">
									<span className="text-foreground font-medium">
										{formatCompactNumber(outputTokens ?? 0)}
									</span>
									{t("agents.table.output")}
									<span className="bg-brand size-2 rounded-full" />
								</span>
							</div>
							<div className="bg-foreground/25 flex h-1.5 overflow-hidden rounded-full">
								<div
									className="bg-brand h-full"
									style={{
										width: `${100 - inputPercent}%`,
										marginLeft: `${inputPercent}%`,
									}}
								/>
							</div>
						</div>
					)}

					{/* per-bucket token breakdown */}
					{usage && (
						<div className="divide-border/70 border-border/70 flex flex-col divide-y border-t pt-1">
							{inputTokens !== undefined && (
								<TokenRow
									label={t("agents.table.input")}
									value={formatCompactNumber(inputTokens)}
									dot="bg-foreground/25"
								/>
							)}
							{outputTokens !== undefined && (
								<TokenRow
									label={t("agents.table.output")}
									value={formatCompactNumber(outputTokens)}
									dot="bg-brand"
								/>
							)}
							{usage.cacheCreationTokens !== undefined && (
								<TokenRow
									label={t("agents.detail.cacheWrite")}
									value={formatCompactNumber(usage.cacheCreationTokens)}
									dot="bg-foreground/15"
								/>
							)}
							{usage.cacheReadTokens !== undefined && (
								<TokenRow
									label={t("agents.detail.cacheRead")}
									value={formatCompactNumber(usage.cacheReadTokens)}
									dot="bg-foreground/15"
								/>
							)}
						</div>
					)}
				</div>
			</div>

			{context &&
				(context.repositories?.length ||
					context.branches?.length ||
					context.refs?.length) && (
					<div className="flex flex-col gap-2">
						<MetaLabel>{t("agents.detail.context")}</MetaLabel>
						<div className="flex flex-col gap-1.5">
							{context.repositories?.map((repo) => {
								const { icon, href } = repoCard(repo);
								return (
									<ContextCard key={`repo:${repo}`} icon={icon} href={href}>
										{repo.replace(/^https?:\/\//, "")}
									</ContextCard>
								);
							})}
							{context.branches?.map((branch) => (
								<ContextCard key={`branch:${branch}`} icon={GitBranchIcon}>
									{branch}
								</ContextCard>
							))}
							{context.refs?.map((ref) => {
								const parsed = parseGithubRef(ref);
								// refs are opaque external references — only a parsed GitHub PR
								// gets the PR icon and a link; anything else stays neutral.
								return (
									<ContextCard
										key={`ref:${ref}`}
										icon={parsed ? GitPullRequestIcon : HashIcon}
										href={
											parsed
												? `${repoUrlFromFullName(parsed.fullName)}/pull/${parsed.number}`
												: undefined
										}
									>
										{parsed ? `${parsed.fullName}#${parsed.number}` : ref}
									</ContextCard>
								);
							})}
						</div>
					</div>
				)}

			<div className="flex items-center gap-2 border-t pt-3">
				<MetaLabel>{t("agents.detail.sessionId")}</MetaLabel>
				<span className="text-muted-foreground font-mono text-xs break-all">
					{entry.sessionId}
				</span>
			</div>
		</div>
	);
}

function MetaLabel({ children }: { children: ReactNode }) {
	return (
		<p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
			{children}
		</p>
	);
}

function MetaItem({
	icon,
	label,
	value,
}: {
	icon: ReactNode;
	label: string;
	value: ReactNode;
}) {
	return (
		<div className="flex items-start gap-2.5">
			<div className="bg-background text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
				{icon}
			</div>
			<div className="min-w-0">
				<MetaLabel>{label}</MetaLabel>
				<div className="mt-0.5 text-sm font-medium">{value}</div>
			</div>
		</div>
	);
}

/** One cell of the usage stat strip (label over a large value). */
function AgentStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-1 flex-col gap-0.5 px-3 first:pl-0 last:pr-0">
			<p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
				{label}
			</p>
			<p className="font-heading text-lg font-semibold tabular-nums">{value}</p>
		</div>
	);
}

/** One row of the per-bucket token breakdown (dot + label + value). */
function TokenRow({
	label,
	value,
	dot,
}: {
	label: string;
	value: string;
	dot: string;
}) {
	return (
		<div className="flex items-center gap-3 py-2">
			<span className={`size-2 shrink-0 rounded-full ${dot}`} />
			<span className="min-w-0 flex-1 truncate text-[13px]">{label}</span>
			<span className="text-muted-foreground shrink-0 text-[13px] tabular-nums">
				{value}
			</span>
		</div>
	);
}

/**
 * Icon + link for a repository context value. `repositories` are
 * `vcs.repository.url.full` URLs from any host, so the GitHub mark is used only
 * when the URL is actually on github.com; anything else gets a neutral repo icon
 * (and a value that isn't an http(s) URL is not linked at all).
 */
function repoCard(repo: string): {
	icon: ComponentType<{ className?: string }>;
	href?: string;
} {
	try {
		const url = new URL(repo);
		if (url.protocol === "http:" || url.protocol === "https:") {
			return {
				icon: url.hostname === "github.com" ? GitHubIcon : FolderGitIcon,
				href: repo,
			};
		}
	} catch {
		// Not a URL (e.g. an SSH remote or a bare name) — fall through to neutral.
	}
	return { icon: FolderGitIcon };
}

/**
 * A context value shown as a card row. Rendered as an external link (with a
 * chevron affordance) only when a real URL is derivable; otherwise a static row,
 * so a non-linkable value (e.g. a branch name) never looks clickable.
 */
function ContextCard({
	icon: Icon,
	href,
	children,
}: {
	icon: ComponentType<{ className?: string }>;
	href?: string;
	children: ReactNode;
}) {
	const inner = (
		<>
			<Icon className="text-muted-foreground size-3.5 shrink-0" />
			<span className="min-w-0 flex-1 truncate font-mono text-[13px]">
				{children}
			</span>
			{href && (
				<ChevronRightIcon className="text-muted-foreground/50 group-hover:text-muted-foreground size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
			)}
		</>
	);
	if (href) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className="group bg-background hover:border-foreground/25 hover:bg-muted/50 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors"
			>
				{inner}
			</a>
		);
	}
	return (
		<div className="bg-background flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm">
			{inner}
		</div>
	);
}
