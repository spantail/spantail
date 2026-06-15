import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	formatPeriodLabel,
	type ReportMeta,
	type ReportShare,
	type ShareStatus,
	shareStatus,
} from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";

const EXPIRY_DAYS = ["1", "7", "30", "none"] as const;

const STATUS_VARIANT: Record<
	ShareStatus,
	"secondary" | "outline" | "destructive"
> = {
	active: "secondary",
	expired: "outline",
	revoked: "destructive",
};

export function ShareDialog({
	report,
	onClose,
}: {
	report: ReportMeta;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [expiry, setExpiry] = useState<string>("7");
	const [passcode, setPasscode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);

	// "Monthly report 2026-06" — the report name plus its period label.
	const title = `${report.name} ${formatPeriodLabel(report.filters.dateRange)}`;

	const shares = useQuery({
		queryKey: ["report-shares", report.id],
		queryFn: () => api.listReportShares(report.id),
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["report-shares", report.id] });

	const createMutation = useMutation({
		mutationFn: () =>
			api.createReportShare(report.id, {
				expiresInDays: expiry === "none" ? undefined : Number(expiry),
				passcode: passcode === "" ? undefined : passcode,
			}),
		onSuccess: async () => {
			await invalidate();
			setPasscode("");
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const revokeMutation = useMutation({
		mutationFn: (id: string) => api.revokeReportShare(id),
		onSuccess: async () => {
			await invalidate();
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	async function copyUrl(share: ReportShare) {
		await navigator.clipboard.writeText(
			`${location.origin}/share/${share.token}`,
		);
		setCopiedId(share.id);
	}

	const rows = shares.data ?? [];

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent size="2xl">
				<DialogHeader>
					<DialogTitle>
						{t("reports.shares.title", { name: title })}
					</DialogTitle>
					<DialogDescription>
						{t("reports.shares.description")}
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-5 sm:grid-cols-2"
					onSubmit={(e) => {
						e.preventDefault();
						createMutation.mutate();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label>{t("reports.shares.expiresIn")}</Label>
						<Select value={expiry} onValueChange={setExpiry}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{EXPIRY_DAYS.map((value) => (
									<SelectItem key={value} value={value}>
										{t(
											`reports.shares.expiry.${value === "none" ? "none" : `d${value}`}`,
										)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="share-passcode">
							{t("reports.shares.passcode")}
						</Label>
						<Input
							id="share-passcode"
							value={passcode}
							minLength={4}
							maxLength={128}
							onChange={(e) => setPasscode(e.target.value)}
							placeholder={t("reports.shares.passcodePlaceholder")}
						/>
					</div>
					{error && (
						<p className="text-destructive text-sm sm:col-span-2">{error}</p>
					)}
					<div className="sm:col-span-2">
						<Button type="submit" disabled={createMutation.isPending}>
							{t("reports.shares.createAction")}
						</Button>
					</div>
				</form>
				{rows.length === 0 && !shares.isPending ? (
					<p className="text-muted-foreground text-sm">
						{t("reports.shares.empty")}
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{rows.map((share) => {
							const status = shareStatus(share);
							return (
								<li
									key={share.id}
									className="flex items-center justify-between gap-2 text-sm"
								>
									<span className="flex flex-wrap items-center gap-2">
										<Badge variant={STATUS_VARIANT[status]}>
											{t(`reports.shares.status.${status}`)}
										</Badge>
										{share.hasPasscode && (
											<Badge variant="outline">
												{t("reports.shares.hasPasscode")}
											</Badge>
										)}
										<span className="text-muted-foreground">
											{new Date(share.createdAt).toLocaleDateString()}
											{share.expiresAt &&
												` · ${t("reports.shares.expires", {
													value: new Date(share.expiresAt).toLocaleDateString(),
												})}`}
											{` · ${t("reports.shares.views", { value: share.viewCount })}`}
										</span>
									</span>
									<span className="whitespace-nowrap">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => copyUrl(share)}
										>
											{copiedId === share.id
												? t("reports.shares.copied")
												: t("reports.shares.copyAction")}
										</Button>
										{!share.revokedAt && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => revokeMutation.mutate(share.id)}
											>
												{t("reports.shares.revokeAction")}
											</Button>
										)}
									</span>
								</li>
							);
						})}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}
