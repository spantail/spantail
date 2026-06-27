import type { SearchResponse } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileChartColumnIcon, NotebookPenIcon, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useEntryDialog } from "@/components/entry-dialog";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { api } from "@/lib/api";
import { isTypingTarget } from "@/lib/keyboard";

/** ⌘ on Apple platforms, Ctrl elsewhere — only affects the displayed hint. */
const isApple =
	typeof navigator !== "undefined" &&
	/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

function useDebounced<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(id);
	}, [value, delayMs]);
	return debounced;
}

export function SearchCommand() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { openView } = useEntryDialog();
	const [open, setOpen] = useState(false);
	const [q, setQ] = useState("");
	const debouncedQ = useDebounced(q.trim(), 200);
	// Latest open() should land focus in the input even when reopened quickly.
	const inputRef = useRef<HTMLInputElement>(null);

	// Open/close with ⌘K (Ctrl+K), ignoring presses inside other text fields.
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (
				(e.metaKey || e.ctrlKey) &&
				e.key.toLowerCase() === "k" &&
				!isTypingTarget(e.target)
			) {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	// Reset the term whenever the dialog closes so it opens clean next time.
	useEffect(() => {
		if (!open) setQ("");
	}, [open]);

	const { data, isFetching } = useQuery<SearchResponse>({
		queryKey: ["search", debouncedQ],
		queryFn: () => api.search(debouncedQ),
		enabled: open && debouncedQ.length > 0,
	});

	// Gate on the active query so stale cached data never renders after the
	// dialog is reopened with an empty term (the query is disabled, but React
	// Query keeps the previous result in cache).
	const active = debouncedQ.length > 0;
	const reports = active ? (data?.reports ?? []) : [];
	const workEntries = active ? (data?.workEntries ?? []) : [];
	const hasResults = reports.length > 0 || workEntries.length > 0;

	function close() {
		setOpen(false);
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label={t("search.open")}
				className="flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-accent-foreground sm:w-56"
			>
				<SearchIcon className="size-4 shrink-0" />
				<span className="hidden sm:inline">{t("search.placeholder")}</span>
				<kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
					{isApple ? "⌘K" : "Ctrl K"}
				</kbd>
			</button>

			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				commandProps={{ shouldFilter: false }}
				title={t("search.title")}
				description={t("search.placeholder")}
			>
				<CommandInput
					ref={inputRef}
					value={q}
					onValueChange={setQ}
					placeholder={t("search.placeholder")}
				/>
				<CommandList>
					{debouncedQ.length === 0 ? (
						<CommandEmpty>{t("search.prompt")}</CommandEmpty>
					) : isFetching && !hasResults ? (
						<CommandEmpty>{t("search.searching")}</CommandEmpty>
					) : !hasResults ? (
						<CommandEmpty>{t("search.empty")}</CommandEmpty>
					) : null}

					{reports.length > 0 && (
						<CommandGroup heading={t("search.groups.reports")}>
							{reports.map((report) => (
								<CommandItem
									key={report.id}
									value={`report-${report.id}`}
									onSelect={() => {
										close();
										void navigate({
											to: "/reports/$tab/$reportId",
											params: { tab: "all", reportId: report.id },
										});
									}}
								>
									<FileChartColumnIcon />
									<span className="truncate">{report.name}</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}

					{workEntries.length > 0 && (
						<CommandGroup heading={t("search.groups.workEntries")}>
							{workEntries.map((entry) => (
								<CommandItem
									key={entry.id}
									value={`work-entry-${entry.id}`}
									onSelect={() => {
										close();
										openView(entry);
									}}
								>
									<NotebookPenIcon />
									<span className="truncate">{entry.description}</span>
									<span className="ml-auto shrink-0 text-muted-foreground text-xs">
										{entry.entryDate}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
