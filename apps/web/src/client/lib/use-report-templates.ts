import { useQuery } from "@tanstack/react-query";
import type { PeriodUnit, ReportMeta, ReportTemplate } from "@toxil/core";

import { api } from "@/lib/api";

const UNIT_RANK: Record<PeriodUnit, number> = {
	day: 0,
	week: 1,
	month: 2,
	custom: 3,
};

export interface ReportTemplates {
	/** All instance templates: builtins + custom rows. */
	templates: ReportTemplate[];
	templateById: Map<string, ReportTemplate>;
	/** Enabled templates, ordered by cadence then name — the sidebar/menu order. */
	enabledTemplates: ReportTemplate[];
	templatesReady: boolean;
	/** Resolves a report's template (for read-only state and Duplicate cadence). */
	reportTemplateState: (report: ReportMeta) => ReportTemplate | undefined;
	/**
	 * Template a new report should use from a given tab: the tab's own template
	 * when it's enabled, else the first enabled template — so creating works on
	 * the All/archived tabs too. Undefined when no template is enabled.
	 */
	createTargetForTab: (tab: string) => ReportTemplate | undefined;
}

/**
 * The report template pool. Templates are instance-scoped presentation formats
 * (enabled/cadence are instance-wide), so the pool is a single list shared by
 * the reports sidebar, list, toolbar, and create/edit dialogs — independent of
 * which workspaces a report covers.
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
		.sort(
			(a, b) =>
				UNIT_RANK[a.periodUnit] - UNIT_RANK[b.periodUnit] ||
				a.name.localeCompare(b.name),
		);

	const reportTemplateState = (
		report: ReportMeta,
	): ReportTemplate | undefined => templateById.get(report.templateId);

	const createTargetForTab = (tab: string): ReportTemplate | undefined => {
		const tabTemplate = templateById.get(tab);
		return tabTemplate?.enabled === true ? tabTemplate : enabledTemplates[0];
	};

	return {
		templates,
		templateById,
		enabledTemplates,
		templatesReady,
		reportTemplateState,
		createTargetForTab,
	};
}
