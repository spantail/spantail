import type { AbsoluteDateRange } from "@spantail/core";
import { useTranslation } from "react-i18next";

import { DateRangePicker } from "@/components/date-range-picker";

/** Dashboard preset window. Each id is a valid `resolveDateRange` preset. */
export type HomePeriod =
	| "last_30_days"
	| "last_7_days"
	| "last_week"
	| "this_week"
	| "last_month"
	| "this_month";

/** Dashboard period: a preset shortcut, or an arbitrary absolute range. */
export type DashboardPeriod = HomePeriod | AbsoluteDateRange;

const PERIOD_LABEL_KEYS: Record<HomePeriod, string> = {
	last_30_days: "dashboard.last30Days",
	last_7_days: "dashboard.last7Days",
	last_week: "dashboard.lastWeek",
	this_week: "dashboard.thisWeek",
	last_month: "dashboard.lastMonth",
	this_month: "dashboard.thisMonth",
};

// Rail order: rolling windows first (shortest first), then calendar weeks and months.
const PERIOD_ORDER: HomePeriod[] = [
	"last_7_days",
	"last_30_days",
	"this_week",
	"last_week",
	"this_month",
	"last_month",
];

/** i18n key for a preset's display label — shared by the chart/donut headers. */
export function periodLabelKey(period: HomePeriod): string {
	return PERIOD_LABEL_KEYS[period];
}

interface PeriodSelectorProps {
	value: DashboardPeriod;
	onChange: (value: DashboardPeriod) => void;
}

/**
 * Period picker for the dashboard widget area: a popover pairing a two-month
 * range calendar with the preset shortcuts. Re-scopes the daily focus chart,
 * the breakdown donut, and the work-log timeline; the inbox stays unaffected.
 */
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
	const { t } = useTranslation();
	return (
		<DateRangePicker
			value={value}
			// Only the four dashboard presets and absolute ranges are reachable here,
			// so the emitted value is always a DashboardPeriod.
			onChange={(next) => onChange(next as DashboardPeriod)}
			presets={PERIOD_ORDER}
			labelFor={(p) => t(periodLabelKey(p as HomePeriod))}
			ariaLabel={t("dashboard.period")}
			align="end"
		/>
	);
}
