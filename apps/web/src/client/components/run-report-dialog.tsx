import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	type AbsoluteDateRange,
	deriveNextPeriod,
	formatPeriodLabel,
	type Report,
	type ReportSnapshot,
	resolveDateRange,
} from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

/**
 * Confirms the period before adding the next snapshot to a series. The
 * suggested period is derived from the previous snapshot (not from "now"),
 * and whatever absolute dates are shown are exactly what runs.
 */
export function RunReportDialog({
	report,
	previous,
	onClose,
	onSuccess,
}: {
	report: Report;
	previous: AbsoluteDateRange | null;
	onClose: () => void;
	onSuccess: (snapshot: ReportSnapshot) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { workspaces, current } = useWorkspace();

	// Same anchor the server uses to resolve presets: the first filter
	// workspace's timezone (a missing membership would 403 on run anyway).
	const timezone =
		workspaces.find((w) => w.id === report.filters.workspaceIds[0])?.timezone ??
		current?.timezone ??
		"UTC";
	const suggested = deriveNextPeriod(
		report.filters.dateRange,
		previous,
		timezone,
	);
	const preset =
		typeof report.filters.dateRange === "string"
			? report.filters.dateRange
			: null;
	const presetNow = preset ? resolveDateRange(preset, timezone) : null;

	const [from, setFrom] = useState(suggested.from);
	const [to, setTo] = useState(suggested.to);
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		// Accepting the preset's own current resolution runs without an
		// override: the server resolves the same dates and templates keep
		// seeing period.preset. Any other range — including dates that were
		// the preset's resolution when the dialog opened but no longer are
		// at submit time (midnight passed) — sends the displayed absolute
		// dates, so what the user confirmed is exactly what runs.
		mutationFn: () => {
			const presetAtSubmit = preset ? resolveDateRange(preset, timezone) : null;
			return api.runReport(
				report.id,
				presetAtSubmit &&
					presetAtSubmit.from === from &&
					presetAtSubmit.to === to
					? undefined
					: { dateRange: { from, to } },
			);
		},
		onSuccess: async (snapshot) => {
			await queryClient.invalidateQueries({
				queryKey: ["report-snapshots", report.id],
			});
			onSuccess(snapshot);
		},
		onError: (err: Error) => setError(err.message),
	});

	const applyRange = (range: AbsoluteDateRange) => {
		setFrom(range.from);
		setTo(range.to);
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>
						{t("reports.runNext.title", { name: report.name })}
					</DialogTitle>
					<DialogDescription>
						{t("reports.runNext.description")}
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-5"
					onSubmit={(e) => {
						e.preventDefault();
						mutation.mutate();
					}}
				>
					<div className="grid gap-5 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="run-from">{t("reports.from")}</Label>
							<Input
								id="run-from"
								type="date"
								className="[color-scheme:light] dark:[color-scheme:dark]"
								value={from}
								onChange={(e) => setFrom(e.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="run-to">{t("reports.to")}</Label>
							<Input
								id="run-to"
								type="date"
								className="[color-scheme:light] dark:[color-scheme:dark]"
								value={to}
								onChange={(e) => setTo(e.target.value)}
								required
							/>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => applyRange(suggested)}
						>
							{t("reports.runNext.suggested")}: {formatPeriodLabel(suggested)}
						</Button>
						{preset &&
							presetNow &&
							(presetNow.from !== suggested.from ||
								presetNow.to !== suggested.to) && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => applyRange(presetNow)}
								>
									{t(`reports.range.${preset}`)}: {formatPeriodLabel(presetNow)}
								</Button>
							)}
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{t("reports.cancelAction")}
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{t("reports.runNext.createAction")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
