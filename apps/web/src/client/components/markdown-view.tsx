import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Renders report markdown; raw HTML stays inert (no rehype-raw).
 * The `report` variant gives the reading pane its article look — headings in the
 * heading font; the default (compact) variant is used for discussion comments.
 */
export function MarkdownView({
	markdown,
	variant = "compact",
}: {
	markdown: string;
	variant?: "compact" | "report";
}) {
	return (
		<div
			className={cn(
				"prose prose-sm dark:prose-invert max-w-none",
				variant === "report" &&
					"prose-headings:font-heading prose-headings:tracking-tight prose-h1:text-2xl prose-h1:leading-tight",
			)}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
		</div>
	);
}
