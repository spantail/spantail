import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders report markdown; raw HTML stays inert (no rehype-raw). */
export function MarkdownView({ markdown }: { markdown: string }) {
	return (
		<div className="prose prose-sm dark:prose-invert max-w-none">
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
		</div>
	);
}
