import {
	type AgentEntry,
	type AgentType,
	formatDuration,
	type ProjectSymbol,
	parseGithubRef,
	repoUrlFromFullName,
	summarizeAgentSessions,
	type WorkEntry,
} from "@spantail/core";
import {
	BotIcon,
	CalendarIcon,
	ChevronRightIcon,
	ClockIcon,
	CodeIcon,
	FolderIcon,
	GitPullRequestIcon,
	GlobeIcon,
	PlugIcon,
	TerminalIcon,
} from "lucide-react";
import { type ComponentType, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { AgentTypeIcon } from "@/components/agent-icon";
import { MarkdownView } from "@/components/markdown-view";
import { PersonAvatar } from "@/components/person-avatar";
import { ProjectMarker } from "@/components/project-marker";
import { GitHubIcon } from "@/components/provider-icons";
import { Badge } from "@/components/ui/badge";
import { formatCompactNumber } from "@/lib/format";

/** Provenance chip icon per logging route. */
const SOURCE_ICONS: Record<
	WorkEntry["source"],
	ComponentType<{ className?: string }>
> = {
	web: GlobeIcon,
	cli: TerminalIcon,
	mcp: PlugIcon,
	api: CodeIcon,
	github: GitHubIcon,
};

interface EntryDetailProps {
	entry: WorkEntry;
	projectName: string;
	/** Project's OKLCH hue for the marker; null when unassigned. */
	projectHue: number | null;
	/** Project's marker symbol; null when unassigned. */
	projectSymbol: ProjectSymbol | null;
	dateLabel: string;
	/** Local start–end time range, when both ends are recorded. */
	timeRange: string | null;
	/** Author's display name; null when the viewer owns the entry. */
	authorName: string | null;
	/** Agent sessions this entry was logged from, filtered to what the viewer may read. */
	agentSessions: AgentEntry[];
	/**
	 * The agent behind the sessions, when they all belong to one (resolved by the
	 * caller): its display name and type (for the icon). Null when unknown/mixed.
	 */
	agentName: string | null;
	agentType: AgentType | null;
}

/**
 * Read-only body of a work entry, shown in the entry dialog: a metadata panel
 * (project / date / duration), tags, the note, an agent-activity card for
 * entries logged from agent sessions, and an author byline for entries the
 * viewer doesn't own.
 */
export function EntryDetail({
	entry,
	projectName,
	projectHue,
	projectSymbol,
	dateLabel,
	timeRange,
	authorName,
	agentSessions,
	agentName,
	agentType,
}: EntryDetailProps) {
	const { t } = useTranslation();
	const SourceIcon = SOURCE_ICONS[entry.source];
	const sourceLabel = t(`entries.sources.${entry.source}`);

	const summary = useMemo(
		() => summarizeAgentSessions(agentSessions),
		[agentSessions],
	);
	// The distinct model(s) the sessions ran on, from usage or session context.
	const model = useMemo(() => {
		const models = new Set<string>();
		for (const session of agentSessions) {
			if (session.usage?.model) models.add(session.usage.model);
			for (const m of session.context?.models ?? []) models.add(m);
		}
		const list = [...models];
		if (list.length === 0) return null;
		return list.length === 1 ? list[0] : `${list[0]} +${list.length - 1}`;
	}, [agentSessions]);
	const hasTokenSplit =
		summary.totalInputTokens + summary.totalOutputTokens > 0;
	const inputPercent = hasTokenSplit
		? Math.round(
				(summary.totalInputTokens /
					(summary.totalInputTokens + summary.totalOutputTokens)) *
					100,
			)
		: 0;

	// Distinct GitHub refs the linked sessions carry, deduped case-insensitively.
	// Only strictly-formatted refs become links — an unparsed ref is never an href.
	const refs = useMemo(() => {
		const seen = new Set<string>();
		const out: { fullName: string; number: number }[] = [];
		for (const session of agentSessions) {
			for (const ref of session.context?.refs ?? []) {
				const parsed = parseGithubRef(ref);
				if (!parsed) continue;
				const key = `${parsed.fullName.toLowerCase()}#${parsed.number}`;
				if (seen.has(key)) continue;
				seen.add(key);
				out.push(parsed);
			}
		}
		return out;
	}, [agentSessions]);

	return (
		<div className="flex flex-col gap-5">
			<div className="bg-muted/40 grid grid-cols-1 gap-4 rounded-xl border p-4 sm:grid-cols-3">
				<MetaItem
					icon={<FolderIcon className="size-3.5" />}
					label={t("entries.project")}
					value={
						projectHue != null && projectSymbol != null ? (
							<span className="flex items-center gap-1.5">
								<ProjectMarker hue={projectHue} symbol={projectSymbol} />
								{projectName}
							</span>
						) : (
							projectName
						)
					}
				/>
				<MetaItem
					icon={<CalendarIcon className="size-3.5" />}
					label={t("entries.date")}
					value={dateLabel}
				/>
				<MetaItem
					icon={<ClockIcon className="size-3.5" />}
					label={t("entries.durationColumn")}
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

			{entry.tags.length > 0 && (
				<div className="flex flex-col gap-2">
					<MetaLabel>{t("entries.tags")}</MetaLabel>
					<div className="flex flex-wrap gap-1.5">
						{entry.tags.map((tag) => (
							<Badge key={tag} variant="secondary">
								{tag}
							</Badge>
						))}
					</div>
				</div>
			)}

			<div className="flex flex-col gap-2">
				<MetaLabel>{t("entries.note")}</MetaLabel>
				{entry.note?.trim() ? (
					<MarkdownView markdown={entry.note} />
				) : (
					<p className="text-muted-foreground text-sm italic">
						{t("entries.noNote")}
					</p>
				)}
			</div>

			{agentSessions.length > 0 && (
				<div className="flex flex-col gap-2">
					<MetaLabel>{t("entries.agentSessions.title")}</MetaLabel>
					<div className="bg-muted/40 flex flex-col gap-4 rounded-xl border p-4">
						{/* identity: agent + model (agent activity has no logging route) */}
						<div className="flex items-center gap-2.5">
							<span className="bg-brand/12 text-brand flex size-8 shrink-0 items-center justify-center rounded-lg">
								{agentType ? (
									<AgentTypeIcon type={agentType} className="size-4" />
								) : (
									<BotIcon className="size-4" />
								)}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-semibold">
									{agentName ?? t("entries.agentSessions.agentFallback")}
								</p>
								{model && (
									<p className="text-muted-foreground truncate font-mono text-[11px]">
										{model}
									</p>
								)}
							</div>
						</div>

						{/* aggregate stat strip */}
						<div className="divide-border flex divide-x">
							<AgentStat
								label={t("entries.agentSessions.sessions")}
								value={formatCompactNumber(summary.sessionCount)}
							/>
							<AgentStat
								label={t("entries.agentSessions.active")}
								value={formatDuration(summary.totalMinutes)}
							/>
							<AgentStat
								label={t("entries.agentSessions.tokens")}
								value={formatCompactNumber(summary.totalTokens)}
							/>
						</div>

						{/* input / output token split — only when a breakdown exists */}
						{hasTokenSplit && (
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center justify-between text-[11px] tabular-nums">
									<span className="text-muted-foreground flex items-center gap-1.5">
										<span className="bg-foreground/25 size-2 rounded-full" />
										{t("entries.agentSessions.input")}{" "}
										<span className="text-foreground font-medium">
											{formatCompactNumber(summary.totalInputTokens)}
										</span>
									</span>
									<span className="text-muted-foreground flex items-center gap-1.5">
										<span className="text-foreground font-medium">
											{formatCompactNumber(summary.totalOutputTokens)}
										</span>
										{t("entries.agentSessions.output")}
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

						{/* per-session list */}
						<div className="divide-border/70 border-border/70 flex flex-col divide-y border-t pt-1">
							{agentSessions.map((session, i) => (
								<div key={session.id} className="flex items-center gap-3 py-2">
									<span className="bg-background text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums">
										{i + 1}
									</span>
									<span className="min-w-0 flex-1 truncate text-[13px]">
										{session.description?.trim() ||
											t("entries.agentSessions.untitled")}
									</span>
									<span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
										{formatDuration(
											session.activeDurationMinutes ?? session.durationMinutes,
										)}{" "}
										· {formatCompactNumber(session.usage?.totalTokens ?? 0)}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{refs.length > 0 && (
				<div className="flex flex-col gap-2">
					<MetaLabel>{t("entries.agentSessions.refs")}</MetaLabel>
					<div className="flex flex-col gap-1.5">
						{refs.map((ref) => (
							<a
								key={`${ref.fullName}#${ref.number}`}
								href={`${repoUrlFromFullName(ref.fullName)}/pull/${ref.number}`}
								target="_blank"
								rel="noopener noreferrer"
								className="group bg-background hover:border-foreground/25 hover:bg-muted/50 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors"
							>
								<GitPullRequestIcon className="text-muted-foreground size-3.5 shrink-0" />
								<span className="min-w-0 flex-1 truncate font-mono text-[13px]">
									<span className="text-muted-foreground">{ref.fullName}</span>
									<span className="text-foreground">#{ref.number}</span>
								</span>
								<ChevronRightIcon className="text-muted-foreground/50 group-hover:text-muted-foreground size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
							</a>
						))}
					</div>
				</div>
			)}

			<div className="flex items-center justify-between gap-3 border-t pt-3">
				{authorName ? (
					<div className="flex min-w-0 items-center gap-2">
						<PersonAvatar name={authorName} size={24} />
						<span className="text-muted-foreground truncate text-sm">
							{authorName}
						</span>
					</div>
				) : (
					<span />
				)}
				<span
					title={`${t("entries.source")} ${sourceLabel}`}
					className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium"
				>
					<SourceIcon className="text-muted-foreground size-3" />
					{sourceLabel}
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

/** One cell of the agent-activity stat strip (label over a large value). */
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
