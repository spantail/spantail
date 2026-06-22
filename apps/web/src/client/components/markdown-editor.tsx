import { type ReactNode, useState } from "react";

import { MarkdownView } from "@/components/markdown-view";
import { cn } from "@/lib/utils";

/**
 * A bordered markdown editor card with a Write/Preview toggle and an optional
 * footer slot. Label/placeholder strings are passed in so each caller owns its
 * i18n — reused by report editing and discussion comments.
 */
export function MarkdownEditor({
	value,
	onChange,
	labels,
	previewEmpty,
	placeholder,
	rows = 3,
	autoFocus = false,
	previewVariant = "compact",
	footer,
}: {
	value: string;
	onChange: (value: string) => void;
	labels: { write: string; preview: string };
	previewEmpty: string;
	placeholder?: string;
	rows?: number;
	autoFocus?: boolean;
	previewVariant?: "compact" | "report";
	footer?: ReactNode;
}) {
	const [tab, setTab] = useState<"write" | "preview">("write");

	return (
		<div className="bg-card min-w-0 flex-1 overflow-hidden rounded-xl border">
			<div className="border-border flex items-center gap-1 border-b px-2 pt-2">
				{(["write", "preview"] as const).map((id) => (
					<button
						key={id}
						type="button"
						onClick={() => setTab(id)}
						className={cn(
							"rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
							tab === id
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{labels[id]}
					</button>
				))}
			</div>
			{tab === "write" ? (
				<textarea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					rows={rows}
					// biome-ignore lint/a11y/noAutofocus: opt-in via prop for inline editors.
					autoFocus={autoFocus}
					placeholder={placeholder}
					className="placeholder:text-muted-foreground block w-full resize-none border-0 bg-transparent px-3.5 py-3 text-sm leading-relaxed outline-none"
				/>
			) : (
				<div className="min-h-[88px] px-3.5 py-3 text-sm leading-relaxed">
					{value.trim() === "" ? (
						<p className="text-muted-foreground italic">{previewEmpty}</p>
					) : (
						<MarkdownView markdown={value} variant={previewVariant} />
					)}
				</div>
			)}
			{footer && (
				<div className="border-border flex items-center justify-between gap-2 border-t px-3 py-2">
					{footer}
				</div>
			)}
		</div>
	);
}
