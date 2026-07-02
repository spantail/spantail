import type { ReportMeta } from "@spantail/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, SearchIcon, SendIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { invalidateReportDiscussion } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * "Send to": drops a frozen snapshot of the report into other members' inboxes.
 * Recipients are scoped to the report's workspaces' members (resolved server-side).
 */
export function SendReportDialog({
	report,
	onClose,
}: {
	report: ReportMeta;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [sendToSelf, setSendToSelf] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState<string | null>(null);

	const recipients = useQuery({
		queryKey: ["report-recipients", report.id],
		queryFn: () => api.listReportRecipients(report.id),
	});

	const sendMutation = useMutation({
		mutationFn: () =>
			api.sendReport(report.id, {
				recipientUserIds: [...selected],
				sendToSelf,
				message: message.trim() === "" ? undefined : message,
			}),
		onSuccess: (result) => {
			// The report is now shared, so a cached {shared:false} discussion
			// (owner opened it before sending) must refetch.
			invalidateReportDiscussion(queryClient, report.id);
			// Reflect this send in the reading pane's inline send history.
			queryClient.invalidateQueries({
				queryKey: ["report-sends", report.id],
			});
			// `delivered` counts teammate recipients only; a self-only send reports 0,
			// so confirm the inbox copy instead.
			toast.success(
				result.delivered === 0
					? t("reports.send.toastSelfOnly")
					: t("reports.send.toast", { count: result.delivered }),
			);
			onClose();
		},
		onError: (err: Error) => setError(err.message),
	});

	const toggle = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const candidates = recipients.data ?? [];
	const query = search.trim().toLowerCase();
	const filtered = query
		? candidates.filter(
				(c) =>
					c.name.toLowerCase().includes(query) ||
					c.email.toLowerCase().includes(query),
			)
		: candidates;
	const count = selected.size;
	const chosen = candidates.filter((c) => selected.has(c.id));

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent size="2xl">
				<DialogHeader>
					<DialogTitle className="pr-10">
						{t("reports.send.title", { name: report.name })}
					</DialogTitle>
					<DialogDescription>{t("reports.send.description")}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						sendMutation.mutate();
					}}
				>
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<Label>{t("reports.send.recipients")}</Label>
							{count > 0 && (
								<span className="text-muted-foreground text-xs">
									{t("reports.send.selectedCount", { count })}
								</span>
							)}
						</div>
						{candidates.length === 0 && !recipients.isPending ? (
							<p className="text-muted-foreground text-sm">
								{t("reports.send.noRecipients")}
							</p>
						) : (
							<>
								<div className="relative">
									<SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
									<Input
										value={search}
										onChange={(e) => setSearch(e.target.value)}
										placeholder={t("reports.send.searchPlaceholder")}
										className="pl-9"
									/>
								</div>
								<div className="flex max-h-60 flex-col overflow-y-auto rounded-lg border">
									{filtered.map((candidate) => {
										const on = selected.has(candidate.id);
										return (
											<button
												key={candidate.id}
												type="button"
												aria-pressed={on}
												onClick={() => toggle(candidate.id)}
												className={cn(
													"flex items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0",
													on ? "bg-primary/5" : "hover:bg-muted/50",
												)}
											>
												<PersonAvatar
													name={candidate.name}
													imageUrl={candidate.imageUrl}
													size={32}
												/>
												<span className="min-w-0 flex-1">
													<span className="block truncate text-sm font-medium">
														{candidate.name}
													</span>
													<span className="text-muted-foreground block truncate text-xs">
														{candidate.email}
													</span>
												</span>
												<span
													className={cn(
														"flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
														on
															? "border-primary bg-primary text-primary-foreground"
															: "border-input",
													)}
												>
													{on && <CheckIcon className="size-3.5" />}
												</span>
											</button>
										);
									})}
									{filtered.length === 0 && (
										<p className="text-muted-foreground px-3 py-6 text-center text-sm">
											{t("reports.send.noMatch")}
										</p>
									)}
								</div>
							</>
						)}
					</div>
					<label htmlFor="send-to-self" className="flex items-start gap-3">
						<Checkbox
							id="send-to-self"
							checked={sendToSelf}
							onCheckedChange={(checked) => setSendToSelf(checked === true)}
							className="mt-0.5"
						/>
						<span className="flex flex-col gap-0.5">
							<span className="text-sm font-medium">
								{t("reports.send.sendToSelf")}
							</span>
							<span className="text-muted-foreground text-xs">
								{t("reports.send.sendToSelfHint")}
							</span>
						</span>
					</label>
					<div className="flex flex-col gap-2">
						<Label htmlFor="send-message">{t("reports.send.message")}</Label>
						<Textarea
							id="send-message"
							value={message}
							maxLength={1000}
							rows={3}
							onChange={(e) => setMessage(e.target.value)}
							placeholder={t("reports.send.messagePlaceholder")}
						/>
						<p className="text-muted-foreground text-xs">
							{t("reports.send.messageHint")}
						</p>
					</div>
					{chosen.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{chosen.map((c) => (
								<span
									key={c.id}
									className="bg-secondary inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs font-medium"
								>
									<PersonAvatar name={c.name} imageUrl={c.imageUrl} size={18} />
									{c.name}
								</span>
							))}
						</div>
					)}
					{error && <p className="text-destructive text-sm">{error}</p>}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{t("reports.send.cancel")}
						</Button>
						<Button
							type="submit"
							disabled={(count === 0 && !sendToSelf) || sendMutation.isPending}
						>
							<SendIcon />
							{count === 0
								? t("reports.send.submit")
								: t("reports.send.submitCount", { count })}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
