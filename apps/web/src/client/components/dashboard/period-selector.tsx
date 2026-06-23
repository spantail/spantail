import {
	type AbsoluteDateRange,
	MAX_REPORT_SPAN_DAYS,
	resolveDateRange,
	shiftDays,
} from "@toxil/core";
import { enUS, ja } from "date-fns/locale";
import { CalendarIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";

import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { formatCompactRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

/** Dashboard preset window. Each id is a valid `resolveDateRange` preset. */
export type HomePeriod =
	| "last_week"
	| "this_week"
	| "last_month"
	| "this_month";

/** Dashboard period: a preset shortcut, or an arbitrary absolute range. */
export type DashboardPeriod = HomePeriod | AbsoluteDateRange;

const PERIOD_LABEL_KEYS: Record<HomePeriod, string> = {
	last_week: "dashboard.lastWeek",
	this_week: "dashboard.thisWeek",
	last_month: "dashboard.lastMonth",
	this_month: "dashboard.thisMonth",
};

// Mockup rail order: month windows first, then week windows (most recent first).
const PERIOD_ORDER: HomePeriod[] = [
	"this_month",
	"last_month",
	"this_week",
	"last_week",
];

/** i18n key for a preset's display label — shared by the chart/donut headers. */
export function periodLabelKey(period: HomePeriod): string {
	return PERIOD_LABEL_KEYS[period];
}

/** Local Date for a `YYYY-MM-DD` string (avoids the `new Date(iso)` UTC shift). */
function toDate(iso: string): Date {
	const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
	return new Date(y, m - 1, d);
}

/** `YYYY-MM-DD` for a local Date. */
function toIso(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

interface PeriodSelectorProps {
	value: DashboardPeriod;
	onChange: (value: DashboardPeriod) => void;
}

/**
 * Period picker for the dashboard widget area: a popover pairing a two-month
 * range calendar with the four preset shortcuts. Re-scopes the daily focus
 * chart and the breakdown donut; the work log and inbox stay unaffected.
 */
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
	const { t, i18n } = useTranslation();
	const { current } = useWorkspace();
	const timezone = current?.timezone ?? "UTC";
	const [open, setOpen] = useState(false);

	// Resolved absolute span for the current value — drives the calendar
	// highlight, the initial month, and the custom-range label.
	const range = resolveDateRange(value, timezone);
	const presetId = typeof value === "string" ? value : null;
	const committed: DateRange = {
		from: toDate(range.from),
		to: toDate(range.to),
	};
	const [draft, setDraft] = useState<DateRange | undefined>(committed);

	const label = presetId
		? t(periodLabelKey(presetId))
		: formatCompactRange(range.from, range.to, i18n.language);

	// If a custom span equals a preset's resolved range, keep that preset lit.
	function matchPreset(from: string, to: string): HomePeriod | null {
		for (const p of PERIOD_ORDER) {
			const r = resolveDateRange(p, timezone);
			if (r.from === from && r.to === to) return p;
		}
		return null;
	}

	function onOpenChange(next: boolean) {
		if (next) setDraft(committed);
		setOpen(next);
	}

	function choosePreset(p: HomePeriod) {
		onChange(p);
		setOpen(false);
	}

	// Drive selection from the clicked day rather than react-day-picker's own
	// range math: a click on an empty or complete range starts fresh, the next
	// click completes and commits. Mirrors the mockup's two-click behaviour.
	function handleSelect(_range: DateRange | undefined, day: Date) {
		if (!draft?.from || draft.to) {
			setDraft({ from: day, to: undefined });
			return;
		}
		const lo = day < draft.from ? day : draft.from;
		const hi = day < draft.from ? draft.from : day;
		const to = toIso(hi);
		// Bound the span like reports do: an unclamped multi-year custom range
		// would issue a huge stats query and render thousands of day bars. Pull
		// the start forward so the chart and query stay bounded.
		const spanDays = Math.round((hi.getTime() - lo.getTime()) / 86_400_000) + 1;
		const from =
			spanDays > MAX_REPORT_SPAN_DAYS
				? shiftDays(to, -(MAX_REPORT_SPAN_DAYS - 1))
				: toIso(lo);
		setDraft({ from: toDate(from), to: hi });
		onChange(matchPreset(from, to) ?? { from, to });
		setOpen(false);
	}

	// Show the month before the range end so a within-month span lands in the
	// right pane (matches the mockup's default May–Jun view for "this month").
	const end = toDate(range.to);
	const defaultMonth = new Date(end.getFullYear(), end.getMonth() - 1, 1);

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger
				aria-label={t("dashboard.period")}
				className={cn(
					"inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border bg-card py-1.5 pr-2 pl-3 text-[13px] font-medium transition-colors hover:bg-muted/50",
					open && "bg-muted/50",
				)}
			>
				<CalendarIcon className="size-3.5 text-muted-foreground" />
				{label}
				<ChevronDownIcon
					className={cn(
						"size-3.5 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
				/>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={6}
				className="flex w-auto flex-row-reverse overflow-hidden p-0"
			>
				<div className="flex w-32 shrink-0 flex-col gap-0.5 border-l p-2">
					{PERIOD_ORDER.map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => choosePreset(p)}
							className={cn(
								"flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent",
								presetId === p
									? "bg-muted/70 font-medium text-foreground"
									: "text-muted-foreground",
							)}
						>
							{t(periodLabelKey(p))}
							{presetId === p && <CheckIcon className="size-3.5 shrink-0" />}
						</button>
					))}
				</div>
				<Calendar
					mode="range"
					numberOfMonths={2}
					weekStartsOn={1}
					defaultMonth={defaultMonth}
					selected={draft}
					onSelect={handleSelect}
					locale={i18n.language.startsWith("ja") ? ja : enUS}
					autoFocus
				/>
			</PopoverContent>
		</Popover>
	);
}
