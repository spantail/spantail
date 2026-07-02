import {
	type DateRangePreset,
	MAX_REPORT_SPAN_DAYS,
	type ReportDateRange,
	resolveDateRange,
	shiftDays,
} from "@spantail/core";
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
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { formatCompactRange } from "@/lib/format";
import { cn } from "@/lib/utils";

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

interface DateRangePickerProps {
	/** A preset shortcut, or an arbitrary absolute range. */
	value: ReportDateRange;
	onChange: (value: ReportDateRange) => void;
	/** Shortcut buttons to show; the array order is the rail order. */
	presets: readonly DateRangePreset[];
	/** Translated label for a preset (drives both the rail and the trigger). */
	labelFor: (preset: DateRangePreset) => string;
	ariaLabel: string;
	/** Lets callers switch the trigger between a pill and a form field. */
	triggerClassName?: string;
	align?: "start" | "end";
}

/**
 * Popover date-range picker pairing a two-month range calendar with a rail of
 * preset shortcuts. Shared by the dashboard widgets (compact pill) and the
 * report form (full-width field); the trigger appearance is driven by
 * `triggerClassName`.
 */
export function DateRangePicker({
	value,
	onChange,
	presets,
	labelFor,
	ariaLabel,
	triggerClassName,
	align = "start",
}: DateRangePickerProps) {
	const { i18n } = useTranslation();
	const timezone = useUserTimezone();
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
		? labelFor(presetId)
		: formatCompactRange(range.from, range.to, i18n.language);

	// If a custom span equals a preset's resolved range, keep that preset lit.
	function matchPreset(from: string, to: string): DateRangePreset | null {
		for (const p of presets) {
			const r = resolveDateRange(p, timezone);
			if (r.from === from && r.to === to) return p;
		}
		return null;
	}

	function onOpenChange(next: boolean) {
		if (next) setDraft(committed);
		setOpen(next);
	}

	function choosePreset(p: DateRangePreset) {
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
			{/* asChild + an explicit type="button" so the trigger never submits the
			    surrounding form (the report form), matching the codebase convention. */}
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={ariaLabel}
					className={cn(
						"inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border bg-card py-1.5 pr-2 pl-3 text-[13px] font-medium transition-colors hover:bg-muted/50",
						open && "bg-muted/50",
						triggerClassName,
					)}
				>
					<CalendarIcon className="size-3.5 text-muted-foreground" />
					{label}
					{/* ml-auto pins the chevron to the right edge when the trigger is a
					    full-width field; a no-op for the content-sized dashboard pill. */}
					<ChevronDownIcon
						className={cn(
							"ml-auto size-3.5 text-muted-foreground transition-transform",
							open && "rotate-180",
						)}
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align={align}
				sideOffset={6}
				className="flex w-auto flex-row-reverse overflow-hidden p-0"
			>
				<div className="flex w-36 shrink-0 flex-col gap-0.5 border-l p-2">
					{presets.map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => choosePreset(p)}
							className={cn(
								"flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent",
								presetId === p
									? "bg-muted/70 font-medium text-foreground"
									: "text-muted-foreground",
							)}
						>
							{labelFor(p)}
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
