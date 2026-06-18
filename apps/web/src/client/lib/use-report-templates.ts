import { useQueries } from "@tanstack/react-query";
import type { PeriodUnit, ReportMeta, ReportTemplate } from "@toxil/core";

import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

const UNIT_RANK: Record<PeriodUnit, number> = {
	day: 0,
	week: 1,
	month: 2,
	custom: 3,
};

export interface ReportTemplates {
	/** Builtins (from the current workspace) + custom templates across all. */
	templates: ReportTemplate[];
	templateById: Map<string, ReportTemplate>;
	/** Enabled templates, ordered by cadence then name — the sidebar/menu order. */
	enabledTemplates: ReportTemplate[];
	templatesReady: boolean;
	/**
	 * A report's template as resolved against its OWN anchor workspace: builtin
	 * enabled/cadence is per-workspace, so read-only and Duplicate cadence must
	 * use the report's first workspace, falling back to the union for customs.
	 */
	reportTemplateState: (report: ReportMeta) => ReportTemplate | undefined;
}

/**
 * The report template pool. Reports are user-owned and can filter any membership
 * workspace, so the pool is the union across all of them: builtins (resolved
 * per-workspace) are taken from the current workspace, custom rows are unioned.
 * Shared by the reports sidebar, list, toolbar, and create/edit dialogs.
 */
export function useReportTemplates(): ReportTemplates {
	const { workspaces, current } = useWorkspace();

	const templateQueries = useQueries({
		queries: workspaces.map((workspace) => ({
			queryKey: ["report-templates", workspace.id],
			queryFn: () => api.listReportTemplates(workspace.id),
		})),
	});

	const seen = new Set<string>();
	const templates: ReportTemplate[] = [];
	// Builtins repeat across workspaces with per-workspace enabled/cadence
	// overrides. New reports anchor to the current workspace, so take builtins
	// from its response (already resolved server-side, and kept fresh because the
	// report-templates query is invalidated on a toggle).
	const currentIndex = workspaces.findIndex((w) => w.id === current?.id);
	const currentTemplates =
		currentIndex >= 0 ? (templateQueries[currentIndex]?.data ?? []) : [];
	for (const template of currentTemplates) {
		if (template.builtin && !seen.has(template.id)) {
			seen.add(template.id);
			templates.push(template);
		}
	}
	// Custom templates: union across all the user's workspaces (ids are unique).
	for (const query of templateQueries) {
		for (const template of query.data ?? []) {
			if (template.builtin || seen.has(template.id)) continue;
			seen.add(template.id);
			templates.push(template);
		}
	}
	const templatesReady = templateQueries.every((query) => !query.isPending);
	const templateById = new Map(templates.map((tpl) => [tpl.id, tpl]));

	const enabledTemplates = templates
		.filter((tpl) => tpl.enabled)
		.sort(
			(a, b) =>
				UNIT_RANK[a.periodUnit] - UNIT_RANK[b.periodUnit] ||
				a.name.localeCompare(b.name),
		);

	// Builtin state per-workspace: index every workspace's response by id so a
	// report resolves against its anchor workspace, not just the union.
	const stateByWorkspace = new Map<string, Map<string, ReportTemplate>>();
	workspaces.forEach((workspace, i) => {
		const byId = new Map<string, ReportTemplate>();
		for (const tpl of templateQueries[i]?.data ?? []) byId.set(tpl.id, tpl);
		stateByWorkspace.set(workspace.id, byId);
	});
	const reportTemplateState = (
		report: ReportMeta,
	): ReportTemplate | undefined =>
		stateByWorkspace
			.get(report.filters.workspaceIds[0] ?? "")
			?.get(report.templateId) ?? templateById.get(report.templateId);

	return {
		templates,
		templateById,
		enabledTemplates,
		templatesReady,
		reportTemplateState,
	};
}
