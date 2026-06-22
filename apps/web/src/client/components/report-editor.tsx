import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Report } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { invalidateReports } from "@/lib/query";

/**
 * Inline editor for a report's frozen document. A report is a snapshot
 * rendered once at creation; here the owner directly revises the title and
 * body — never a re-render from source entries. To regenerate from source,
 * delete and recreate the report.
 */
export function ReportEditor({
	report,
	onDone,
}: {
	report: Report;
	onDone: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [name, setName] = useState(report.name);
	const [markdown, setMarkdown] = useState(report.renderedMarkdown);
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () =>
			api.updateReport(report.id, { name, renderedMarkdown: markdown }),
		onSuccess: (updated) => {
			// Seed the detail cache so the reading pane shows the edit immediately,
			// and refresh the list (the name may have changed).
			queryClient.setQueryData(["report", report.id], updated);
			invalidateReports(queryClient);
			setError(null);
			onDone();
		},
		onError: (err: Error) => setError(err.message),
	});

	const dirty = name !== report.name || markdown !== report.renderedMarkdown;
	const valid = name.trim() !== "" && markdown.trim() !== "";

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<Label htmlFor="report-edit-name">{t("reports.name")}</Label>
				<Input
					id="report-edit-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
				/>
			</div>
			<MarkdownEditor
				value={markdown}
				onChange={setMarkdown}
				labels={{
					write: t("reports.edit.write"),
					preview: t("reports.edit.preview"),
				}}
				previewEmpty={t("reports.edit.previewEmpty")}
				placeholder={t("reports.edit.bodyPlaceholder")}
				previewVariant="report"
				rows={24}
			/>
			{error && <p className="text-destructive text-sm">{error}</p>}
			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={onDone}>
					{t("reports.cancelAction")}
				</Button>
				<Button
					type="button"
					disabled={mutation.isPending || !dirty || !valid}
					onClick={() => mutation.mutate()}
				>
					{t("reports.saveAction")}
				</Button>
			</div>
		</div>
	);
}
