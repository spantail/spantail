import { type ShareStatus, shareStatus } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

const STATUS_VARIANT: Record<
	ShareStatus,
	"secondary" | "outline" | "destructive"
> = {
	active: "secondary",
	expired: "outline",
	revoked: "destructive",
};

/**
 * Read-only history of a report's outbound activity, shown under the body: the
 * "Send to" batches and the public share links. Managing them (create / copy /
 * revoke) stays in the toolbar's Send and Share dialogs — this is a record, not
 * a control surface.
 */
export function ReportHistory({ reportId }: { reportId: string }) {
	const { t } = useTranslation();
	const sends = useQuery({
		queryKey: ["report-sends", reportId],
		queryFn: () => api.listReportSends(reportId),
	});
	const shares = useQuery({
		queryKey: ["report-shares", reportId],
		queryFn: () => api.listReportShares(reportId),
	});

	// Hold the section back until both settle, so it doesn't flash empty then fill.
	if (sends.isPending || shares.isPending) return null;

	const sendRows = sends.data ?? [];
	const shareRows = shares.data ?? [];
	const empty = sendRows.length === 0 && shareRows.length === 0;

	return (
		<section className="flex flex-col gap-5 border-t pt-6 print:hidden">
			<h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
				{t("reports.history.title")}
			</h2>
			{empty ? (
				<p className="text-muted-foreground text-sm">
					{t("reports.history.empty")}
				</p>
			) : (
				<>
					{sendRows.length > 0 && (
						<div className="flex flex-col gap-2">
							<h3 className="text-muted-foreground text-xs font-medium">
								{t("reports.history.sentHeading")}
							</h3>
							<ul className="flex flex-col gap-3">
								{sendRows.map((send) => (
									<li key={send.id} className="flex flex-col gap-0.5 text-sm">
										<span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
											{send.recipientCount === 0 ? (
												// A self-only send: no teammate recipients, just an inbox copy.
												<span className="font-medium">
													{t("reports.history.selfOnly")}
												</span>
											) : (
												<>
													<span className="font-medium">
														{t("reports.history.recipients", {
															count: send.recipientCount,
														})}
													</span>
													{send.recipientNames.length > 0 && (
														<span className="text-muted-foreground">
															{send.recipientNames.join(", ")}
														</span>
													)}
												</>
											)}
										</span>
										<span className="text-muted-foreground text-xs">
											{new Date(send.createdAt).toLocaleString()}
											{send.recipientCount > 0 &&
												` · ${t("reports.history.read", {
													read: send.readCount,
													total: send.recipientCount,
												})}`}
										</span>
										{send.message && (
											<span className="text-muted-foreground text-xs italic">
												{send.message}
											</span>
										)}
									</li>
								))}
							</ul>
						</div>
					)}
					{shareRows.length > 0 && (
						<div className="flex flex-col gap-2">
							<h3 className="text-muted-foreground text-xs font-medium">
								{t("reports.history.sharedHeading")}
							</h3>
							<ul className="flex flex-col gap-2">
								{shareRows.map((share) => {
									const status = shareStatus(share);
									return (
										<li
											key={share.id}
											className="flex flex-wrap items-center gap-2 text-sm"
										>
											<Badge variant={STATUS_VARIANT[status]}>
												{t(`reports.shares.status.${status}`)}
											</Badge>
											{share.hasPasscode && (
												<Badge variant="outline">
													{t("reports.shares.hasPasscode")}
												</Badge>
											)}
											<span className="text-muted-foreground text-xs">
												{new Date(share.createdAt).toLocaleDateString()}
												{share.expiresAt &&
													` · ${t("reports.shares.expires", {
														value: new Date(
															share.expiresAt,
														).toLocaleDateString(),
													})}`}
												{` · ${t("reports.shares.views", { value: share.viewCount })}`}
											</span>
										</li>
									);
								})}
							</ul>
						</div>
					)}
				</>
			)}
		</section>
	);
}
