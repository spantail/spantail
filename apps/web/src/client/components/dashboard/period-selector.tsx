import { CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

/** Dashboard period. Each id is a valid `resolveDateRange` preset. */
export type HomePeriod =
	| "last_week"
	| "this_week"
	| "last_month"
	| "this_month";

const PERIOD_LABEL_KEYS: Record<HomePeriod, string> = {
	last_week: "dashboard.lastWeek",
	this_week: "dashboard.thisWeek",
	last_month: "dashboard.lastMonth",
	this_month: "dashboard.thisMonth",
};

const PERIOD_ORDER: HomePeriod[] = [
	"last_week",
	"this_week",
	"last_month",
	"this_month",
];

/** i18n key for a period's display label — shared by the chart/donut headers. */
export function periodLabelKey(period: HomePeriod): string {
	return PERIOD_LABEL_KEYS[period];
}

interface PeriodSelectorProps {
	value: HomePeriod;
	onChange: (value: HomePeriod) => void;
}

/**
 * Period picker for the dashboard widget area. Re-scopes the daily focus chart
 * and the breakdown donut; the work log and inbox are intentionally unaffected.
 */
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
	const { t } = useTranslation();
	return (
		<Select value={value} onValueChange={(v) => onChange(v as HomePeriod)}>
			<SelectTrigger
				aria-label={t("dashboard.period")}
				className="gap-2 rounded-lg pr-2 pl-3 text-[13px] font-medium"
			>
				<CalendarIcon className="size-3.5 text-muted-foreground" />
				<SelectValue />
			</SelectTrigger>
			<SelectContent
				align="end"
				position="popper"
				sideOffset={6}
				className="min-w-40 rounded-lg p-1"
			>
				{PERIOD_ORDER.map((period) => (
					<SelectItem
						key={period}
						value={period}
						className="rounded-md py-1.5 pl-2.5 text-[13px] text-muted-foreground data-[state=checked]:font-medium data-[state=checked]:text-foreground"
					>
						{t(periodLabelKey(period))}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
