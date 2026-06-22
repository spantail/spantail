import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
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
	titleKey: string;
	seed: ReportFormSeed;
}

/**
 * Owns the report create/duplicate dialog for the mailbox shell, so the list
 * header (New) and the detail toolbar (Duplicate) can open it. Editing a report
 * is a direct, inline revision on the reading pane, not a form. On save it
 * routes to the new report's detail pane.
 */
export function ReportDialogsProvider({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	// Deep-link seed (e.g. the home timeline's "create daily report" button).
	const search = useSearch({ from: "/reports" });
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
			titleKey: "reports.newTitle",
			seed: newSeed(template),
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

	// A deep link with `?create=<templateId>&from=&to=` opens a pre-seeded create
	// dialog scoped to that range. A latest-callback ref keeps the seeding logic
	// (which reads the template pool and current workspace) out of the effect's
	// dependencies, so it runs only when the params actually change.
	const seedFromLink = useRef<(s: typeof search) => void>(() => {});
	useLayoutEffect(() => {
		seedFromLink.current = (s) => {
			// Resolve through createTargetForTab so a disabled template (which the
			// API still lists) falls back to an enabled one — a disabled seed would
			// render a form that the reports API rejects on save.
			const template = s.create ? createTargetForTab(s.create) : undefined;
			if (!template) return;
			// Keep the report scoped to the workspace the link came from: the reports
			// shell otherwise derives `current` from persisted state, which can drift
			// from the originating workspace in multi-tab sessions.
			const wsId =
				s.ws && workspaces.some((w) => w.id === s.ws) ? s.ws : current?.id;
			const base = newSeed(template);
			const custom = Boolean(s.from && s.to);
			open({
				titleKey: "reports.newTitle",
				seed: {
					...base,
					workspaceIds: wsId ? [wsId] : base.workspaceIds,
					...(custom
						? {
								rangeChoice: "custom" as const,
								from: s.from ?? "",
								to: s.to ?? "",
							}
						: {}),
				},
			});
		};
	});
	useEffect(() => {
		if (!search.create || !templatesReady) return;
		seedFromLink.current(search);
		// Clear the deep-link params so a refresh or Back doesn't reopen the dialog.
		navigate({
			to: ".",
			replace: true,
			search: (prev) => ({
				...prev,
				create: undefined,
				from: undefined,
				to: undefined,
				ws: undefined,
			}),
		});
	}, [search, templatesReady, navigate]);

	return (
		<ReportDialogsContext.Provider value={{ openCreate, openDuplicate }}>
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
							key={instanceId}
							templates={templates}
							templatesReady={templatesReady}
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
