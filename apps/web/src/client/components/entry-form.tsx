import type { Project, WorkEntry } from "@spantail/core";
import {
	formatDuration,
	parseDuration,
	shiftDays,
	todayInTimezone,
	utcToZonedTime,
	zonedDateTimeToUtc,
} from "@spantail/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { invalidateWorkEntryData } from "@/lib/query";

// Sentinel select value for "no project" (Radix Select forbids an empty value).
const NO_PROJECT = "__none__";

interface EntryFormProps {
	workspaceId: string;
	timezone: string;
	projects: Project[];
	initial: WorkEntry | null;
	defaultProjectId?: string;
	onSuccess: (opts: { keepOpen: boolean }) => void;
	onCancel: () => void;
}

/**
 * True elapsed minutes between two `HH:MM` wall times on `date` in the given
 * timezone, using zoned instants (so DST transitions are counted). An end
 * instant at or before the start rolls to the next day, which keeps overnight
 * ranges — and starts a DST gap normalizes forward — non-negative.
 */
function rangeMinutes(
	date: string,
	startTime: string,
	endTime: string,
	timeZone: string,
): number | null {
	if (!startTime || !endTime) return null;
	const startMs = new Date(
		zonedDateTimeToUtc(date, startTime, timeZone),
	).getTime();
	let endMs = new Date(zonedDateTimeToUtc(date, endTime, timeZone)).getTime();
	if (endMs < startMs) {
		endMs = new Date(
			zonedDateTimeToUtc(shiftDays(date, 1), endTime, timeZone),
		).getTime();
	}
	return Math.round((endMs - startMs) / 60000);
}

/** The `HH:MM` end clock `mins` after `startTime` on `date` (in `timeZone`). */
function endClock(
	date: string,
	startTime: string,
	mins: number,
	timeZone: string,
): string {
	const startMs = new Date(
		zonedDateTimeToUtc(date, startTime, timeZone),
	).getTime();
	return utcToZonedTime(
		new Date(startMs + mins * 60000).toISOString(),
		timeZone,
	);
}

/** True when `HH:MM` time `a` is earlier in the day than `b`. */
function timeBefore(a: string, b: string): boolean {
	const [ah, am] = a.split(":").map(Number);
	const [bh, bm] = b.split(":").map(Number);
	return (ah ?? 0) * 60 + (am ?? 0) < (bh ?? 0) * 60 + (bm ?? 0);
}

/**
 * Create/edit form hosted by the entry dialog. Mounted fresh per open (the
 * dialog keys it), so all state derives from props in the initializers.
 */
export function EntryForm({
	workspaceId,
	timezone,
	projects,
	initial,
	defaultProjectId,
	onSuccess,
	onCancel,
}: EntryFormProps) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	// Editing an entry orphaned by a project deletion: keep it assignable to
	// "no project" so its other fields stay editable without forcing a project.
	const canUnassign = Boolean(initial) && initial?.projectId == null;
	const [projectId, setProjectId] = useState(
		initial ? (initial.projectId ?? NO_PROJECT) : (defaultProjectId ?? ""),
	);
	const [entryDate, setEntryDate] = useState(
		initial?.entryDate ?? todayInTimezone(timezone),
	);
	const [duration, setDuration] = useState(
		initial ? String(initial.durationMinutes) : "",
	);
	const [startTime, setStartTime] = useState(
		initial?.startedAt ? utcToZonedTime(initial.startedAt, timezone) : "",
	);
	const [endTime, setEndTime] = useState(
		initial?.endedAt ? utcToZonedTime(initial.endedAt, timezone) : "",
	);
	const [description, setDescription] = useState(initial?.description ?? "");
	const [note, setNote] = useState(initial?.note ?? "");
	const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
	const [error, setError] = useState<string | null>(null);
	// Create mode only: keep the dialog open after logging to enter another entry,
	// preserving project and date while the other fields are cleared.
	const [keepEntering, setKeepEntering] = useState(false);
	const durationRef = useRef<HTMLInputElement>(null);

	// Start/end times drive the duration (counted across DST transitions), but
	// minutes can still be entered directly, which nudges the end time.
	const derived = rangeMinutes(entryDate, startTime, endTime, timezone);
	// Parsed minutes from the duration field (accepts "90", "1h30m", "3.5h", …).
	const parsedDuration = parseDuration(duration);
	const endsNextDay =
		Boolean(startTime && endTime) && timeBefore(endTime, startTime);
	const handleStartTime = (value: string) => {
		setStartTime(value);
		const mins = rangeMinutes(entryDate, value, endTime, timezone);
		if (mins != null) setDuration(String(mins));
	};
	const handleEndTime = (value: string) => {
		setEndTime(value);
		const mins = rangeMinutes(entryDate, startTime, value, timezone);
		if (mins != null) setDuration(String(mins));
	};
	const handleDuration = (value: string) => {
		setDuration(value);
		setError(null); // a fresh edit clears a stale "invalid duration" message
		const mins = parseDuration(value);
		if (startTime && mins != null)
			setEndTime(endClock(entryDate, startTime, mins, timezone));
	};
	// Changing the date re-derives the duration: elapsed minutes depend on the
	// date when the range spans a DST transition.
	const handleDate = (value: string) => {
		setEntryDate(value);
		const mins = rangeMinutes(value, startTime, endTime, timezone);
		if (mins != null) setDuration(String(mins));
	};
	const sameAsStart = Boolean(startTime && endTime) && derived === 0;

	const mutation = useMutation({
		mutationFn: () => {
			// Start is the entry date at the start clock in the user timezone.
			// The end instant is the start plus the (authoritative) duration, so it
			// stays correct past midnight and for entries of 24h or longer.
			// Fail fast: the submit button is disabled while unparseable, but Enter
			// can still trigger an implicit submit, and 0 minutes is never valid.
			const minutes = parseDuration(duration);
			if (minutes == null) throw new Error(t("entries.invalidDuration"));
			const startedAt = startTime
				? zonedDateTimeToUtc(entryDate, startTime, timezone)
				: undefined;
			const endedAt = startedAt
				? new Date(
						new Date(startedAt).getTime() + minutes * 60000,
					).toISOString()
				: endTime
					? zonedDateTimeToUtc(entryDate, endTime, timezone)
					: undefined;
			const payload = {
				entryDate,
				durationMinutes: minutes,
				description,
				note: note.trim() === "" ? undefined : note,
				tags: tags
					.split(",")
					.map((tag) => tag.trim())
					.filter(Boolean),
			};
			return initial
				? api.updateWorkEntry(initial.id, {
						...payload,
						projectId: projectId === NO_PROJECT ? null : projectId,
						note: payload.note ?? null,
						startedAt: startedAt ?? null,
						endedAt: endedAt ?? null,
					})
				: api.createWorkEntry({
						workspaceId,
						projectId,
						...payload,
						startedAt,
						endedAt,
					});
		},
		onSuccess: () => {
			invalidateWorkEntryData(queryClient, workspaceId);
			// "Keep entering" applies to logging new entries only. Reset the inputs
			// that describe this specific entry, keeping project and date for the next.
			const keepOpen = !initial && keepEntering;
			if (keepOpen) {
				setStartTime("");
				setEndTime("");
				setDuration("");
				setTags("");
				setDescription("");
				setNote("");
				setError(null);
				// Land the cursor on duration so the next entry starts there.
				durationRef.current?.focus();
			}
			onSuccess({ keepOpen });
		},
		onError: (err: Error) => setError(err.message),
	});

	const activeProjects = projects.filter((p) => p.status === "active");

	if (activeProjects.length === 0 && !initial) {
		return (
			<div className="flex flex-col items-start gap-3">
				<p className="text-muted-foreground text-sm">
					{t("entries.noProjects")}
				</p>
				<Button asChild variant="outline" onClick={onCancel}>
					<Link to="/settings/projects">{t("entries.goToSettings")}</Link>
				</Button>
			</div>
		);
	}

	return (
		<form
			className="grid gap-5 sm:grid-cols-2"
			onSubmit={(e) => {
				e.preventDefault();
				setError(null);
				mutation.mutate();
			}}
		>
			<div className="flex flex-col gap-2">
				<Label>{t("entries.project")}</Label>
				<Select value={projectId} onValueChange={setProjectId} required>
					<SelectTrigger>
						<SelectValue placeholder={t("entries.selectProject")} />
					</SelectTrigger>
					<SelectContent>
						{canUnassign && (
							<SelectItem value={NO_PROJECT}>
								{t("entries.noProject")}
							</SelectItem>
						)}
						{activeProjects.map((project) => (
							<SelectItem key={project.id} value={project.id}>
								{project.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="entry-date">{t("entries.date")}</Label>
				<Input
					id="entry-date"
					type="date"
					className="[color-scheme:light] dark:[color-scheme:dark]"
					value={entryDate}
					onChange={(e) => handleDate(e.target.value)}
					required
				/>
			</div>
			<div className="flex flex-col gap-2 sm:col-span-2">
				<Label htmlFor="entry-description">{t("entries.description")}</Label>
				<Input
					id="entry-description"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder={t("entries.descriptionPlaceholder")}
					required
				/>
			</div>
			<div className="grid gap-5 sm:col-span-2 sm:grid-cols-3">
				<div className="flex flex-col gap-2">
					<Label htmlFor="entry-duration">{t("entries.duration")}</Label>
					<Input
						id="entry-duration"
						ref={durationRef}
						type="text"
						inputMode="text"
						placeholder={t("entries.durationPlaceholder")}
						value={duration}
						onChange={(e) => handleDuration(e.target.value)}
						required
					/>
					<p className="text-muted-foreground text-xs">
						{derived != null
							? t("entries.minutesFromRange", {
									duration: formatDuration(derived),
								})
							: parsedDuration != null
								? t("entries.durationParsed", {
										duration: formatDuration(parsedDuration),
										minutes: parsedDuration,
									})
								: t("entries.minutesManual")}
					</p>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="entry-start">{t("entries.startTime")}</Label>
					<Input
						id="entry-start"
						type="time"
						className="[color-scheme:light] dark:[color-scheme:dark]"
						value={startTime}
						onChange={(e) => handleStartTime(e.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="entry-end">{t("entries.endTime")}</Label>
					<Input
						id="entry-end"
						type="time"
						className="[color-scheme:light] dark:[color-scheme:dark]"
						value={endTime}
						onChange={(e) => handleEndTime(e.target.value)}
					/>
					{sameAsStart ? (
						<p className="text-muted-foreground text-xs">
							{t("entries.sameAsStart")}
						</p>
					) : endsNextDay ? (
						<p className="text-muted-foreground text-xs">
							{t("entries.endsNextDay")}
						</p>
					) : null}
				</div>
			</div>
			<div className="flex flex-col gap-2 sm:col-span-2">
				<Label htmlFor="entry-tags">{t("entries.tags")}</Label>
				<Input
					id="entry-tags"
					placeholder={t("entries.tagsPlaceholder")}
					value={tags}
					onChange={(e) => setTags(e.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-2 sm:col-span-2">
				<Label htmlFor="entry-note">{t("entries.note")}</Label>
				<Textarea
					id="entry-note"
					className="field-sizing-fixed"
					value={note}
					onChange={(e) => setNote(e.target.value)}
					rows={4}
				/>
			</div>
			{error && (
				<p className="text-destructive text-sm sm:col-span-2">{error}</p>
			)}
			<DialogFooter className="sm:col-span-2 sm:items-center sm:justify-between">
				{initial ? (
					<span />
				) : (
					<div className="flex items-center gap-2">
						<Switch
							id="entry-keep-entering"
							checked={keepEntering}
							onCheckedChange={setKeepEntering}
						/>
						<Label
							htmlFor="entry-keep-entering"
							className="font-normal text-muted-foreground"
						>
							{t("entries.keepEntering")}
						</Label>
					</div>
				)}
				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button type="button" variant="outline" onClick={onCancel}>
						{t("entries.cancelAction")}
					</Button>
					<Button
						type="submit"
						disabled={
							mutation.isPending || !projectId || parsedDuration == null
						}
					>
						{initial ? t("entries.saveAction") : t("entries.logAction")}
					</Button>
				</div>
			</DialogFooter>
		</form>
	);
}
