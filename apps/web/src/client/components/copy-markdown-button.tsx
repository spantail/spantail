import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * Copies the report's Markdown source to the clipboard. Lives in the reading
 * pane's preview, top-right of the article — it copies the displayed Markdown
 * text, not the rendered HTML. The icon flips to a check for a moment after a
 * successful copy.
 */
export function CopyMarkdownButton({
	markdown,
	className,
}: {
	markdown: string;
	className?: string;
}) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => () => clearTimeout(timer.current), []);

	const copy = async () => {
		await navigator.clipboard.writeText(markdown);
		setCopied(true);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), 1600);
	};

	const label = copied
		? t("reports.view.copiedLabel")
		: t("reports.view.copyAction");

	return (
		<button
			type="button"
			onClick={copy}
			aria-label={label}
			title={label}
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-lg border p-1.5 transition-colors",
				copied
					? "bg-secondary text-foreground border-transparent"
					: "text-muted-foreground hover:bg-accent hover:text-foreground",
				className,
			)}
		>
			{copied ? (
				<CheckIcon className="size-3.5" />
			) : (
				<CopyIcon className="size-3.5" />
			)}
		</button>
	);
}
