import {
	type AgentEntry,
	formatDuration,
	type ProjectSymbol,
	parseGithubRef,
	repoUrlFromFullName,
	summarizeAgentSessions,
	type WorkEntry,
} from "@spantail/core";
import {
	CalendarIcon,
	ClockIcon,
	CodeIcon,
	FolderIcon,
	GlobeIcon,
	PlugIcon,
	TerminalIcon,
} from "lucide-react";
import { type ComponentType, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

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
}

/**
 * Read-only body of a work entry, shown in the entry dialog: a metadata panel
 * (project / date / duration), tags, the note, and an author byline for
 * entries the viewer doesn't own.
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
}: EntryDetailProps) {
	const { t } = useTranslation();
	const SourceIcon = SOURCE_ICONS[entry.source];
	const sourceLabel = t(`entries.sources.${entry.source}`);

	const summary = useMemo(
		() => summarizeAgentSessions(agentSessions),
		[agentSessions],
	);
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

			{agentSessions.length > 0 && (
				<div className="flex flex-col gap-2">
					<MetaLabel>{t("entries.agentSessions.title")}</MetaLabel>
					<div className="bg-muted/40 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl border p-4 text-sm sm:grid-cols-4">
						<Stat
							label={t("entries.agentSessions.sessions")}
							value={formatCompactNumber(summary.sessionCount)}
						/>
						<Stat
							label={t("entries.agentSessions.time")}
							value={formatDuration(summary.totalMinutes)}
						/>
						<Stat
							label={t("entries.agentSessions.tokens")}
							value={formatCompactNumber(summary.totalTokens)}
						/>
						{summary.totalCostUsd !== null && (
							<Stat
								label={t("entries.agentSessions.cost")}
								value={`$${summary.totalCostUsd.toFixed(2)}`}
							/>
						)}
					</div>
					{refs.length > 0 && (
						<div className="mt-1 flex flex-col gap-1.5">
							<span className="text-muted-foreground text-xs font-medium">
								{t("entries.agentSessions.refs")}
							</span>
							<div className="flex flex-wrap gap-1.5">
								{refs.map((ref) => (
									<a
										key={`${ref.fullName}#${ref.number}`}
										href={`${repoUrlFromFullName(ref.fullName)}/issues/${ref.number}`}
										target="_blank"
										rel="noreferrer"
										className="bg-muted hover:bg-muted/70 rounded-md px-2 py-0.5 font-mono text-xs break-all"
									>
										{ref.fullName}#{ref.number}
									</a>
								))}
							</div>
						</div>
					)}
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

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="tabular-nums">{value}</span>
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
