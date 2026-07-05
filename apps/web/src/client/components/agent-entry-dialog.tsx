import type { AgentEntry, Project } from "@spantail/core";
import { formatDuration } from "@spantail/core";
import { CalendarIcon, ClockIcon, CpuIcon, FolderIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ProjectMarker } from "@/components/project-marker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	formatClock,
	formatCompactNumber,
	formatEntryDate,
} from "@/lib/format";

interface AgentEntryDialogProps {
	/** Open when non-null; the session whose detail is shown. */
	entry: AgentEntry | null;
	onClose: () => void;
	/** Resolved project for the entry's marker; undefined when unassigned. */
	project?: Project;
	/** Display name for the entry's project (already resolved by the caller). */
	projectName: string;
	timezone: string;
}

/**
 * Read-only detail of one captured agent session, shown in a dialog: metadata
 * (project / date / duration), token usage, session id, and the aggregated
 * context (repositories / branches / refs / models). Agent sessions are
 * ingested, never edited here, so there are no actions.
 */
export function AgentEntryDialog({
	entry,
	onClose,
	project,
	projectName,
	timezone,
}: AgentEntryDialogProps) {
	const { t, i18n } = useTranslation();

	const dateLabel = entry
		? formatEntryDate(entry.entryDate, i18n.language, {
				year: "numeric",
				month: "short",
				day: "numeric",
				weekday: "short",
			})
		: "";
	const timeRange =
		entry?.startedAt && entry.endedAt
			? `${formatClock(entry.startedAt, timezone)}–${formatClock(entry.endedAt, timezone)}`
			: null;

	const usage = entry?.usage ?? null;
	const context = entry?.context ?? null;
	const contextGroups: { key: string; label: string; values: string[] }[] =
		context
			? [
					{ key: "repositories", values: context.repositories },
					{ key: "branches", values: context.branches },
					{ key: "refs", values: context.refs },
					{ key: "models", values: context.models },
				]
					.filter((g): g is { key: string; values: string[] } =>
						Boolean(g.values?.length),
					)
					.map((g) => ({
						key: g.key,
						label: t(`agents.detail.${g.key}`),
						values: g.values,
					}))
			: [];

	return (
		<Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent size="2xl">
				<DialogHeader>
					<DialogTitle className="break-words">
						{entry?.description?.trim()
							? entry.description
							: t("agents.detail.noDescription")}
					</DialogTitle>
					<DialogDescription className="sr-only">
						{[
							projectName,
							dateLabel,
							entry ? formatDuration(entry.durationMinutes) : "",
						].join(" · ")}
					</DialogDescription>
				</DialogHeader>

				{entry && (
					<div className="flex flex-col gap-5">
						<div className="bg-muted/40 grid grid-cols-1 gap-4 rounded-xl border p-4 sm:grid-cols-3">
							<MetaItem
								icon={<FolderIcon className="size-3.5" />}
								label={t("agents.table.project")}
								value={
									project ? (
										<span className="flex items-center gap-1.5">
											<ProjectMarker
												hue={project.hue}
												symbol={project.symbol}
											/>
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

						{usage && (
							<div className="flex flex-col gap-2">
								<MetaLabel>{t("agents.detail.usage")}</MetaLabel>
								{usage.model && (
									<div className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
										<CpuIcon className="size-3.5" />
										{usage.model}
									</div>
								)}
								<div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
									{usage.inputTokens !== undefined && (
										<Stat
											label={t("agents.table.input")}
											value={formatCompactNumber(usage.inputTokens)}
										/>
									)}
									{usage.outputTokens !== undefined && (
										<Stat
											label={t("agents.table.output")}
											value={formatCompactNumber(usage.outputTokens)}
										/>
									)}
									{usage.cacheCreationTokens !== undefined && (
										<Stat
											label={t("agents.detail.cacheWrite")}
											value={formatCompactNumber(usage.cacheCreationTokens)}
										/>
									)}
									{usage.cacheReadTokens !== undefined && (
										<Stat
											label={t("agents.detail.cacheRead")}
											value={formatCompactNumber(usage.cacheReadTokens)}
										/>
									)}
									<Stat
										label={t("agents.detail.totalTokens")}
										value={formatCompactNumber(usage.totalTokens)}
									/>
									{usage.costUsd !== undefined && (
										<Stat
											label={t("agents.detail.cost")}
											value={`$${usage.costUsd.toFixed(2)}`}
										/>
									)}
								</div>
							</div>
						)}

						{contextGroups.length > 0 && (
							<div className="flex flex-col gap-3">
								<MetaLabel>{t("agents.detail.context")}</MetaLabel>
								{contextGroups.map((group) => (
									<div key={group.key} className="flex flex-col gap-1.5">
										<span className="text-muted-foreground text-xs font-medium">
											{group.label}
										</span>
										<div className="flex flex-wrap gap-1.5">
											{group.values.map((value) => (
												<span
													key={value}
													className="bg-muted rounded-md px-2 py-0.5 font-mono text-xs break-all"
												>
													{value}
												</span>
											))}
										</div>
									</div>
								))}
							</div>
						)}

						<div className="flex items-center gap-2 border-t pt-3">
							<MetaLabel>{t("agents.detail.sessionId")}</MetaLabel>
							<span className="text-muted-foreground font-mono text-xs break-all">
								{entry.sessionId}
							</span>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
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
