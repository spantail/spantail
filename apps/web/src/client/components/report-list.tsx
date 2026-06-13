import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Report, ReportSnapshot, ReportTemplate } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";

function rangeLabel(report: Report, t: (key: string) => string): string {
	const range = report.filters.dateRange;
	if (typeof range === "string") return t(`reports.range.${range}`);
	return `${range.from} – ${range.to}`;
}

export function ReportList({
	templates,
	onEdit,
	onView,
	onSnapshots,
}: {
	templates: ReportTemplate[];
	onEdit: (report: Report) => void;
	onView: (report: Report, snapshot: ReportSnapshot) => void;
	onSnapshots: (report: Report) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);

	const reports = useQuery({
		queryKey: ["reports"],
		queryFn: () => api.listReports(),
	});

	const runMutation = useMutation({
		mutationFn: (report: Report) =>
			api.runReport(report.id).then((snapshot) => ({ report, snapshot })),
		onSuccess: async ({ report, snapshot }) => {
			await queryClient.invalidateQueries({
				queryKey: ["report-snapshots", report.id],
			});
			setError(null);
			onView(report, snapshot);
		},
		onError: (err: Error) => setError(err.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteReport(id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["reports"] });
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const rows = reports.data ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("reports.listTitle")}
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{error && <p className="text-destructive text-sm">{error}</p>}
				{rows.length === 0 && !reports.isPending ? (
					<p className="text-muted-foreground text-sm">{t("reports.empty")}</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("reports.name")}</TableHead>
								<TableHead>{t("reports.template")}</TableHead>
								<TableHead>{t("reports.dateRange")}</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((report) => (
								<TableRow key={report.id}>
									<TableCell>{report.name}</TableCell>
									<TableCell className="text-muted-foreground">
										{templates.find((tpl) => tpl.id === report.templateId)
											?.name ?? report.templateId}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{rangeLabel(report, t)}
									</TableCell>
									<TableCell className="text-right whitespace-nowrap">
										<Button
											variant="outline"
											size="sm"
											className="mr-1"
											disabled={runMutation.isPending}
											onClick={() => runMutation.mutate(report)}
										>
											{t("reports.runAction")}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => onSnapshots(report)}
										>
											{t("reports.snapshotsAction")}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => onEdit(report)}
										>
											{t("reports.editAction")}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => deleteMutation.mutate(report.id)}
										>
											{t("reports.deleteAction")}
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
