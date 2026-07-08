import {
	todayInTimezone,
	utcToZonedTime,
	type WorkEntry,
} from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { DockedPanel } from "@/components/docked-panel";
import { EntryDetail } from "@/components/entry-detail";
import { Button } from "@/components/ui/button";
import { useDeleteWorkEntry } from "@/hooks/use-delete-work-entry";
import { useProjects } from "@/hooks/use-projects";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";

interface EntryDetailPanelProps {
	entry: WorkEntry;
	/** Position of `entry` in the registered list, or -1 when it isn't in it. */
	index: number;
	/**
	 * Size of the registered list. Independent of `index`: it can be > 0 while
	 * `index` is -1 — an entry opened from elsewhere (e.g. search) that isn't a
	 * row in the list that happens to be mounted. The counter/nav use `index`,
	 * not `total`, to decide whether the entry is navigable.
	 */
	total: number;
	onPrev?: () => void;
	onNext?: () => void;
	onEdit: () => void;
	onClose: () => void;
	/**
	 * Called after an entry is deleted, with the deleted entry's id (captured at
	 * click time, so a selection change during the async delete can't misattribute
	 * it). Advances the selection or closes.
	 */
	onDeleted: (deletedId: string) => void;
}

/**
 * Work-entry detail docked at the right edge. Wraps the shared {@link DockedPanel}
 * shell with the work-entry read-only body ({@link EntryDetail}) and an
 * owner-only edit/delete footer; the frame, resize, Esc close, and header nav
 * live in the shell.
 */
export function EntryDetailPanel({
	entry,
	index,
	total,
	onPrev,
	onNext,
	onEdit,
	onClose,
	onDeleted,
}: EntryDetailPanelProps) {
	const { t, i18n } = useTranslation();
	const { current } = useWorkspace();
	const { session } = useRouteContext({ from: "/_authed" });
	const timezone = useUserTimezone();
	const today = todayInTimezone(timezone);
	const projects = useProjects();
	// The entry a delete is acting on, captured when the button is pressed so the
	// success handler reports the right id even if the selection has since moved.
	const deletingIdRef = useRef<string | null>(null);
	const deleteMutation = useDeleteWorkEntry(entry, () => {
		if (deletingIdRef.current) onDeleted(deletingIdRef.current);
	});

	const isOwn = entry.userId === session.user.id;

	// Author byline (and the member lookup it needs) only applies to entries the
	// viewer doesn't own.
	const members = useQuery({
		queryKey: ["members", current?.id],
		queryFn: () => api.listMembers(current?.id as string),
		enabled: Boolean(current) && !isOwn,
	});
	// Agent sessions this entry was logged from — gated on the instance feature
	// flag. The server filters by the agent-entry ACL, so a viewer sees only
	// sessions they may read.
	const agentsEnabled = useQuery({
		queryKey: ["agents-enabled"],
		queryFn: () => api.getAgentsEnabled(),
	});
	const linkedSessions = useQuery({
		queryKey: ["work-entry-agent-entries", current?.id, entry.id],
		queryFn: () => api.listWorkEntryAgentEntries(entry.id),
		enabled: Boolean(current) && (agentsEnabled.data?.enabled ?? false),
	});
	// Resolves the sessions' agentId to a display name for the activity card —
	// only worth fetching once we know this entry actually has linked sessions.
	const workspaceAgents = useQuery({
		queryKey: ["workspace-agents", current?.id],
		queryFn: () => api.listWorkspaceAgents(current?.id as string),
		enabled: Boolean(current) && (linkedSessions.data?.length ?? 0) > 0,
	});
	// Identify the agent behind the card only when every session shares one.
	const agent = useMemo(() => {
		const sessions = linkedSessions.data ?? [];
		const ids = [...new Set(sessions.map((s) => s.agentId))];
		if (ids.length !== 1) return null;
		return (workspaceAgents.data ?? []).find((a) => a.id === ids[0]) ?? null;
	}, [linkedSessions.data, workspaceAgents.data]);

	const project = entry.projectId
		? (projects.data ?? []).find((p) => p.id === entry.projectId)
		: undefined;
	const projectName = entry.projectId
		? (project?.name ?? entry.projectId)
		: t("projects.unassigned");
	const dateLabel = formatDay(entry.entryDate, i18n.language, { now: today });
	const timeRange =
		entry.startedAt && entry.endedAt
			? `${utcToZonedTime(entry.startedAt, timezone)}–${utcToZonedTime(entry.endedAt, timezone)}`
			: null;
	const authorName = isOwn
		? null
		: ((members.data ?? []).find((m) => m.userId === entry.userId)?.name ??
			null);

	return (
		<DockedPanel
			title={entry.description}
			index={index}
			total={total}
			onPrev={onPrev}
			onNext={onNext}
			onClose={onClose}
			labels={{
				prev: t("entries.panel.prevEntry"),
				next: t("entries.panel.nextEntry"),
				close: t("entries.panel.close"),
				resize: t("entries.panel.resize"),
				moveHint: t("entries.panel.moveHint"),
			}}
			footer={
				isOwn ? (
					<>
						<Button
							variant="ghost"
							size="sm"
							disabled={deleteMutation.isPending}
							onClick={() => {
								deletingIdRef.current = entry.id;
								deleteMutation.mutate();
							}}
							className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive mr-auto"
						>
							<Trash2Icon />
							{t("entries.deleteAction")}
						</Button>
						<Button size="sm" onClick={onEdit}>
							<PencilIcon />
							{t("entries.editAction")}
						</Button>
					</>
				) : undefined
			}
		>
			<EntryDetail
				entry={entry}
				projectName={projectName}
				projectHue={project?.hue ?? null}
				projectSymbol={project?.symbol ?? null}
				dateLabel={dateLabel}
				timeRange={timeRange}
				authorName={authorName}
				agentSessions={linkedSessions.data ?? []}
				agentName={agent?.name ?? null}
				agentType={agent?.type ?? null}
			/>
		</DockedPanel>
	);
}
