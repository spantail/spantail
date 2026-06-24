import type { Project, WorkSpan, WorkspaceMember } from "@spantail/core";
import { formatDuration } from "@spantail/core";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { SpanActions } from "@/components/span-actions";
import { useSpanDialog } from "@/components/span-dialog";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { formatSpanDate } from "@/lib/format";

interface SpanListProps {
	spans: WorkSpan[];
	projects: Project[];
	members: WorkspaceMember[];
	showProject?: boolean;
	/** Loads the next page when keyboard nav reaches the last span. */
	onLoadMore?: () => void;
}

/** Tabular all-members span list (author column, own-row actions). */
export function SpanList({
	spans,
	projects,
	members,
	showProject = true,
	onLoadMore,
}: SpanListProps) {
	const { t, i18n } = useTranslation();
	const { openView } = useSpanDialog();
	const projectName = (id: string | null) =>
		id
			? (projects.find((p) => p.id === id)?.name ?? id)
			: t("projects.unassigned");
	const memberName = (id: string) =>
		members.find((m) => m.userId === id)?.name ?? id;

	const containerRef = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState(-1);
	useListKeyboardNav({
		length: spans.length,
		index: active,
		onMove: setActive,
		onOpen: () => {
			const span = spans[active];
			if (span) openView(span);
		},
		onReachEnd: onLoadMore,
		containerRef,
	});

	if (spans.length === 0) {
		return (
			<p className="text-muted-foreground p-4 text-center text-sm">
				{t("spans.empty")}
			</p>
		);
	}

	return (
		<div ref={containerRef}>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="text-muted-foreground text-xs">
							{t("spans.date")}
						</TableHead>
						{showProject && (
							<TableHead className="text-muted-foreground text-xs">
								{t("spans.project")}
							</TableHead>
						)}
						<TableHead className="text-muted-foreground text-xs">
							{t("spans.author")}
						</TableHead>
						<TableHead className="text-muted-foreground w-full text-xs">
							{t("spans.description")}
						</TableHead>
						<TableHead className="text-muted-foreground text-right text-xs">
							{t("spans.durationColumn")}
						</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{spans.map((span, index) => (
						// The whole row opens the detail dialog: the description button's
						// stretched overlay (`before:inset-0`) covers the relative row, so a
						// real button keeps it keyboard-accessible and lint-clean — no click
						// handler on the <tr>. The actions cell is raised above the overlay.
						<TableRow
							key={span.id}
							data-nav-index={index}
							data-nav-active={active === index ? "" : undefined}
							className="group data-[nav-active]:bg-muted relative cursor-pointer"
						>
							<TableCell className="text-muted-foreground py-3 whitespace-nowrap">
								{formatSpanDate(span.spanDate, i18n.language, {
									weekday: "short",
									month: "short",
									day: "numeric",
								})}
							</TableCell>
							{showProject && (
								<TableCell className="py-3 whitespace-nowrap">
									{projectName(span.projectId)}
								</TableCell>
							)}
							<TableCell className="py-3 whitespace-nowrap">
								{memberName(span.userId)}
							</TableCell>
							<TableCell className="py-3">
								<button
									type="button"
									onClick={() => openView(span)}
									className="flex flex-wrap items-center gap-1.5 text-left before:absolute before:inset-0 before:content-['']"
								>
									<span className="underline-offset-4 group-hover:underline">
										{span.description}
									</span>
									{span.tags.map((tag) => (
										<Badge key={tag} variant="secondary">
											{tag}
										</Badge>
									))}
								</button>
							</TableCell>
							<TableCell className="text-muted-foreground py-3 text-right whitespace-nowrap tabular-nums">
								{formatDuration(span.durationMinutes)}
							</TableCell>
							<TableCell className="relative z-10 py-3 whitespace-nowrap">
								<SpanActions span={span} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
