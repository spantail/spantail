import type { AgentEntry, Project } from "@spantail/core";
import { useTranslation } from "react-i18next";

import { AgentEntryDetail } from "@/components/agent-entry-detail";
import { DockedPanel } from "@/components/docked-panel";

interface AgentEntryDetailPanelProps {
	entry: AgentEntry;
	/** Position of `entry` in the sessions list. */
	index: number;
	/** Size of the sessions list. */
	total: number;
	onPrev?: () => void;
	onNext?: () => void;
	onClose: () => void;
	/** Resolved project for the marker; undefined when unassigned. */
	project?: Project;
	/** Display name for the entry's project (already resolved by the caller). */
	projectName: string;
	timezone: string;
}

/**
 * Agent-session detail docked at the right edge — the read-only counterpart of
 * the work-entry panel. Wraps the shared {@link DockedPanel} shell with the
 * {@link AgentEntryDetail} body; sessions are ingested, never edited, so there
 * is no footer.
 */
export function AgentEntryDetailPanel({
	entry,
	index,
	total,
	onPrev,
	onNext,
	onClose,
	project,
	projectName,
	timezone,
}: AgentEntryDetailPanelProps) {
	const { t } = useTranslation();
	return (
		<DockedPanel
			title={
				entry.description?.trim()
					? entry.description
					: t("agents.detail.noDescription")
			}
			index={index}
			total={total}
			onPrev={onPrev}
			onNext={onNext}
			onClose={onClose}
			labels={{
				prev: t("agents.panel.prevSession"),
				next: t("agents.panel.nextSession"),
				close: t("agents.panel.close"),
				resize: t("agents.panel.resize"),
				moveHint: t("agents.panel.moveHint"),
			}}
		>
			<AgentEntryDetail
				entry={entry}
				project={project}
				projectName={projectName}
				timezone={timezone}
			/>
		</DockedPanel>
	);
}
