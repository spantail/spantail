import type { ReportMeta, ReportTemplate } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface ReportTemplates {
	/** All instance templates. */
	templates: ReportTemplate[];
	templateById: Map<string, ReportTemplate>;
	/** Enabled templates, ordered by name — the sidebar/menu order. */
	enabledTemplates: ReportTemplate[];
	/** The instance default template, when it is enabled (compose fallback). */
	defaultTemplate: ReportTemplate | undefined;
	templatesReady: boolean;
	/** Resolves a report's template (for read-only state). */
	reportTemplateState: (report: ReportMeta) => ReportTemplate | undefined;
	/**
	 * Template a new report should use from a given tab: the tab's own template
	 * when it's enabled, else the first enabled template — so creating works on
	 * the All/archived tabs too. Undefined when no template is enabled.
	 */
	createTargetForTab: (tab: string) => ReportTemplate | undefined;
}

/**
 * The report template pool. Templates are instance-scoped presentation formats,
 * so the pool is a single list shared by the reports sidebar, list, toolbar,
 * and create/edit dialogs — independent of which workspaces a report covers.
 */
export function useReportTemplates(): ReportTemplates {
	const templatesQuery = useQuery({
		queryKey: ["report-templates"],
		queryFn: () => api.listReportTemplates(),
	});

	const templates = templatesQuery.data ?? [];
	const templatesReady = !templatesQuery.isPending;
	const templateById = new Map(templates.map((tpl) => [tpl.id, tpl]));

	const enabledTemplates = templates
		.filter((tpl) => tpl.enabled)
		.sort((a, b) => a.name.localeCompare(b.name));

	// The instance default backs new reports from the All/archived tabs. Fall
	// back to the first enabled template if the default is somehow disabled.
	const defaultEnabled = templates.find((tpl) => tpl.isDefault && tpl.enabled);

	const reportTemplateState = (
		report: ReportMeta,
	): ReportTemplate | undefined => templateById.get(report.templateId);

	const createTargetForTab = (tab: string): ReportTemplate | undefined => {
		const tabTemplate = templateById.get(tab);
		if (tabTemplate?.enabled === true) return tabTemplate;
		return defaultEnabled ?? enabledTemplates[0];
	};

	return {
		templates,
		templateById,
		enabledTemplates,
		defaultTemplate: defaultEnabled,
		templatesReady,
		reportTemplateState,
		createTargetForTab,
	};
}
