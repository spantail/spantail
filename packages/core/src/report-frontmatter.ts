import { stringify } from "yaml";

import type { DateRangePreset } from "./report";

/**
 * Machine-readable provenance embedded as a YAML front-matter header at the top
 * of a rendered report's content. It is system-generated (never template- or
 * user-controlled) so every version is self-describing for Send/Share/export.
 * `note` is deliberately excluded — it is long/multi-line and rendered into the
 * body — and is snapshotted as a column instead.
 */
export interface ReportFrontMatter {
	name: string;
	version: number;
	templateId: string;
	period: { from: string; to: string; preset: DateRangePreset | null };
	filters: {
		workspaceIds: string[];
		projectIds?: string[];
		userIds?: string[];
		tags?: string[];
	};
	totalMinutes: number;
	timezone: string;
	generatedAt: string;
}

/**
 * Serializes the front-matter to a `---\n…\n---\n` block. `yaml.stringify`
 * quotes/escapes every string scalar, so report names and tags can hold any
 * characters without corrupting the block.
 */
export function buildReportFrontMatter(meta: ReportFrontMatter): string {
	return `---\n${stringify(meta)}---\n`;
}

// Only matches a block anchored at the very start of the document; the
// non-greedy body stops at the first closing fence, so a thematic break (`---`)
// later in the Markdown is never mistaken for the terminator.
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

// Keys this module always emits. A leading block is only treated as our header
// when it carries all of them, so a legacy report whose body happens to open
// with a user/template `---` block (e.g. pre-migration content backfilled
// without a marker) keeps that block visible instead of losing content.
const SIGNATURE_KEYS = ["version", "templateId", "generatedAt"];

function isSystemFrontMatter(block: string): boolean {
	return SIGNATURE_KEYS.every((key) =>
		new RegExp(`(^|\\n)${key}:`).test(block),
	);
}

/**
 * Splits the system-generated YAML front-matter header from the Markdown body.
 * Returns the original string as `body` (and `frontMatter: null`) when there is
 * none, or when a leading block isn't our header (see SIGNATURE_KEYS). Used to
 * hide the header at display time; the structured fields are never parsed back
 * (the report header is the source of truth).
 */
export function splitFrontMatter(md: string): {
	frontMatter: string | null;
	body: string;
} {
	const match = md.match(FRONT_MATTER_RE);
	if (!match || !isSystemFrontMatter(match[1] ?? "")) {
		return { frontMatter: null, body: md };
	}
	return { frontMatter: match[1] ?? "", body: md.slice(match[0].length) };
}
