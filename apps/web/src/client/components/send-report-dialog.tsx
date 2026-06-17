import { useMutation, useQuery } from "@tanstack/react-query";
import { formatPeriodLabel, type ReportMeta } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [message, setMessage] = useState("");
	const [error, setError] = useState<string | null>(null);

	const title = `${report.name} ${formatPeriodLabel(report.filters.dateRange)}`;

	const recipients = useQuery({
		queryKey: ["report-recipients", report.id],
		queryFn: () => api.listReportRecipients(report.id),
	});

	const sendMutation = useMutation({
		mutationFn: () =>
			api.sendReport(report.id, {
				recipientUserIds: [...selected],
				message: message.trim() === "" ? undefined : message,
			}),
		onSuccess: (result) => {
			toast.success(t("reports.send.toast", { count: result.delivered }));
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

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>{t("reports.send.title", { name: title })}</DialogTitle>
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
						<Label>{t("reports.send.recipients")}</Label>
						{candidates.length === 0 && !recipients.isPending ? (
							<p className="text-muted-foreground text-sm">
								{t("reports.send.noRecipients")}
							</p>
						) : (
							<>
								<Input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder={t("reports.send.searchPlaceholder")}
								/>
								<ul className="max-h-56 overflow-y-auto rounded-lg border">
									{filtered.map((candidate) => (
										<li
											key={candidate.id}
											className="hover:bg-muted/40 flex items-center gap-3 px-3 py-2 text-sm"
										>
											<Checkbox
												id={`recipient-${candidate.id}`}
												checked={selected.has(candidate.id)}
												onCheckedChange={() => toggle(candidate.id)}
											/>
											<Label
												htmlFor={`recipient-${candidate.id}`}
												className="min-w-0 flex-1 cursor-pointer font-normal"
											>
												<span className="min-w-0 flex-1">
													<span className="block truncate font-medium">
														{candidate.name}
													</span>
													<span className="text-muted-foreground block truncate text-xs">
														{candidate.email}
													</span>
												</span>
											</Label>
										</li>
									))}
									{filtered.length === 0 && (
										<li className="text-muted-foreground px-3 py-2 text-sm">
											{t("reports.send.noMatch")}
										</li>
									)}
								</ul>
							</>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="send-message">{t("reports.send.message")}</Label>
						<Textarea
							id="send-message"
							value={message}
							maxLength={1000}
							onChange={(e) => setMessage(e.target.value)}
							placeholder={t("reports.send.messagePlaceholder")}
						/>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{t("reports.send.cancel")}
						</Button>
						<Button
							type="submit"
							disabled={selected.size === 0 || sendMutation.isPending}
						>
							{t("reports.send.sendAction")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
