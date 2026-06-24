import { splitFrontMatter } from "@spantail/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Renders report markdown; raw HTML stays inert (no rehype-raw).
 * The `report` variant gives the reading pane its article look — headings in the
 * heading font; the default (compact) variant is used for discussion comments.
 * Report content carries a system YAML front-matter header (machine-readable
 * provenance); it is stripped before display so the raw block is never shown.
 */
export function MarkdownView({
	markdown,
	variant = "compact",
}: {
	markdown: string;
	variant?: "compact" | "report";
}) {
	const body =
		variant === "report" ? splitFrontMatter(markdown).body : markdown;
	return (
		<div
			className={cn(
				"prose prose-sm dark:prose-invert max-w-none",
				variant === "report" &&
					"prose-headings:font-heading prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-2xl prose-h1:leading-tight prose-h2:text-xl prose-h3:text-base prose-h4:text-sm",
			)}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
		</div>
	);
}
