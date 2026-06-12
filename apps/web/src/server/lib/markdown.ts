import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

// Server-side twin of the SPA's MarkdownView (react-markdown without
// rehype-raw): remark-rehype's defaults drop raw HTML, keeping the "no
// raw-HTML passthrough" invariant; rehype-sanitize adds defense in depth
// and strips unsafe link protocols such as javascript:.
const processor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype)
	.use(rehypeSanitize, defaultSchema)
	.use(rehypeStringify);

export async function renderMarkdownToHtml(markdown: string): Promise<string> {
	return String(await processor.process(markdown));
}
