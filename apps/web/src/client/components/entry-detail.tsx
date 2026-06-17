import type { WorkEntry } from "@toxil/core";
import { useTranslation } from "react-i18next";

import { MarkdownView } from "@/components/markdown-view";
import { Badge } from "@/components/ui/badge";

/**
 * Read-only body of a work entry, shown in the entry dialog. The description
 * and metadata are the dialog's title and subtitle; this renders tags and note.
 */
export function EntryDetail({ entry }: { entry: WorkEntry }) {
	const { t } = useTranslation();

	return (
		<div className="flex flex-col gap-4">
			{entry.tags.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{entry.tags.map((tag) => (
						<Badge key={tag} variant="secondary">
							{tag}
						</Badge>
					))}
				</div>
			)}

			<div className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">{t("entries.note")}</h3>
				{entry.note?.trim() ? (
					<MarkdownView markdown={entry.note} />
				) : (
					<p className="text-muted-foreground text-sm">{t("entries.noNote")}</p>
				)}
			</div>
		</div>
	);
}
