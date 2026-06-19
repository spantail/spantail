import { useNavigate, useParams } from "@tanstack/react-router";
import {
	deriveNextPeriod,
	type PeriodUnit,
	type ReportMeta,
	type ReportTemplate,
} from "@toxil/core";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";

import { ReportForm, type ReportFormSeed } from "@/components/report-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { isTypingTarget } from "@/lib/keyboard";
import { useReportTemplates } from "@/lib/use-report-templates";
import { useWorkspace } from "@/lib/workspace";

const UNIT_PRESET: Record<PeriodUnit, ReportFormSeed["rangeChoice"]> = {
	day: "today",
	week: "this_week",
	month: "this_month",
	custom: "custom",
};

interface ReportDialogsApi {
	openCreate: (template: ReportTemplate) => void;
	openEdit: (report: ReportMeta) => void;
	openDuplicate: (report: ReportMeta) => void;
}

const ReportDialogsContext = createContext<ReportDialogsApi | null>(null);

export function useReportDialogs(): ReportDialogsApi {
	const ctx = useContext(ReportDialogsContext);
	if (!ctx) {
		throw new Error(
			"useReportDialogs must be used within ReportDialogsProvider",
		);
	}
	return ctx;
}

interface FormState {
	editingId: string | null;
	titleKey: string;
	seed: ReportFormSeed;
}

/**
 * Owns the report create/edit/duplicate dialog for the mailbox shell, so the
 * list header (New) and the detail toolbar (Edit/Duplicate) can all open it.
 * On save it routes to the report's detail pane — the old viewer dialog's role.
 */
export function ReportDialogsProvider({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { workspaces, current } = useWorkspace();
	const { templates, templatesReady, reportTemplateState, createTargetForTab } =
		useReportTemplates();
	// The active template tab, when a reports route is mounted, picks which
	// template `c` creates from (mirrors the list's New button).
	const tab = useParams({ strict: false, select: (p) => p.tab }) as
		| string
		| undefined;
	const [form, setForm] = useState<FormState | null>(null);
	// Remount key so the form re-derives its initial state on every open.
	const [instanceId, setInstanceId] = useState(0);

	const open = (state: FormState) => {
		setForm(state);
		setInstanceId((id) => id + 1);
	};

	const newSeed = (template: ReportTemplate): ReportFormSeed => ({
		name: "",
		nameEdited: false,
		templateId: template.id,
		// Templates carry no workspace; a new report defaults to the current one.
		workspaceIds: current ? [current.id] : [],
		projectIds: [],
		rangeChoice: UNIT_PRESET[template.periodUnit],
		from: "",
		to: "",
		tags: "",
		note: "",
	});

	const openCreate = (template: ReportTemplate) =>
		open({
			editingId: null,
			titleKey: "reports.newTitle",
			seed: newSeed(template),
		});

	const openEdit = (report: ReportMeta) =>
		open({
			editingId: report.id,
			titleKey: "reports.editTitle",
			seed: {
				name: report.name,
				nameEdited: true,
				templateId: report.templateId,
				workspaceIds: report.filters.workspaceIds,
				projectIds: report.filters.projectIds ?? [],
				rangeChoice: "custom",
				from: report.filters.dateRange.from,
				to: report.filters.dateRange.to,
				tags: (report.filters.tags ?? []).join(", "),
				note: report.note ?? "",
			},
		});

	const openDuplicate = (report: ReportMeta) => {
		// Cadence comes from the report's anchor workspace (builtins vary by ws).
		const unit = reportTemplateState(report)?.periodUnit ?? "custom";
		const timezone =
			workspaces.find((w) => w.id === report.filters.workspaceIds[0])
				?.timezone ??
			current?.timezone ??
			"UTC";
		const next = deriveNextPeriod(unit, report.filters.dateRange, timezone);
		open({
			editingId: null,
			titleKey: "reports.duplicateTitle",
			seed: {
				name: "",
				nameEdited: false,
				templateId: report.templateId,
				workspaceIds: report.filters.workspaceIds,
				projectIds: report.filters.projectIds ?? [],
				rangeChoice: "custom",
				from: next.from,
				to: next.to,
				tags: (report.filters.tags ?? []).join(", "),
				// Notes differ every period, so a duplicate starts with a blank one.
				note: "",
			},
		});
	};

	const closeForm = () => setForm(null);

	// `c` opens the create dialog from anywhere on the reports screen (mirrors
	// the entry dialog's shortcut). A latest-callback ref keeps a single window
	// listener while always reading the current tab and template pool.
	const trigger = useRef<() => void>(() => {});
	useLayoutEffect(() => {
		trigger.current = () => {
			const target = createTargetForTab(tab ?? "all");
			if (target) openCreate(target);
		};
	});
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.repeat || e.isComposing || e.defaultPrevented) return;
			if (isTypingTarget(e.target)) return;
			// A bare keypress in an open dialog/menu may be Radix typeahead input.
			if (document.querySelector('[role="dialog"], [role="menu"]')) return;
			e.preventDefault();
			trigger.current();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<ReportDialogsContext.Provider
			value={{ openCreate, openEdit, openDuplicate }}
		>
			{children}
			{form && (
				<Dialog open onOpenChange={(isOpen) => !isOpen && closeForm()}>
					<DialogContent size="2xl">
						<DialogHeader>
							<DialogTitle>{t(form.titleKey)}</DialogTitle>
							<DialogDescription>
								{t("reports.formDescription")}
							</DialogDescription>
						</DialogHeader>
						<ReportForm
							key={`${form.editingId ?? "new"}:${instanceId}`}
							templates={templates}
							templatesReady={templatesReady}
							editingId={form.editingId}
							seed={form.seed}
							onComplete={(report) => {
								closeForm();
								// Route to the new/edited report under a tab that shows it.
								navigate({
									to: "/reports/$tab/$reportId",
									params: { tab: report.templateId, reportId: report.id },
								});
							}}
							onCancel={closeForm}
						/>
					</DialogContent>
				</Dialog>
			)}
		</ReportDialogsContext.Provider>
	);
}
