import { describe, expect, it } from "vitest";

import {
	buildReportFrontMatter,
	parseReportFrontMatter,
	type ReportFrontMatter,
	splitFrontMatter,
} from "./report-frontmatter";

const meta: ReportFrontMatter = {
	name: "Weekly: Q3 — review",
	version: 2,
	templateId: "tmpl-weekly",
	period: { from: "2026-06-15", to: "2026-06-21", preset: "last_week" },
	filters: { workspaceIds: ["ws-1"], tags: ["api", "needs: triage"] },
	totalMinutes: 525,
	timezone: "Asia/Tokyo",
	generatedAt: "2026-06-22T09:00:00.000Z",
};

describe("report front-matter", () => {
	it("wraps serialized YAML in a fenced block and round-trips through split", () => {
		const fm = buildReportFrontMatter(meta);
		expect(fm.startsWith("---\n")).toBe(true);
		expect(fm.endsWith("---\n")).toBe(true);
		const content = `${fm}# Body heading\n\n- item`;
		const { frontMatter, body } = splitFrontMatter(content);
		expect(frontMatter).not.toBeNull();
		expect(body).toBe("# Body heading\n\n- item");
		// Values with YAML-special characters stay intact in the header.
		expect(frontMatter).toContain("needs: triage");
		expect(frontMatter).toContain("version: 2");
	});

	it("does not treat a thematic break in the body as the terminator", () => {
		const content = `${buildReportFrontMatter(meta)}# Title\n\n---\n\n_Generated_`;
		const { body } = splitFrontMatter(content);
		expect(body).toBe("# Title\n\n---\n\n_Generated_");
	});

	it("returns the whole string as body when there is no front-matter", () => {
		const { frontMatter, body } = splitFrontMatter("# Just a body\n\n---\n");
		expect(frontMatter).toBeNull();
		expect(body).toBe("# Just a body\n\n---\n");
	});

	it("parses the system header back into structured fields", () => {
		const content = `${buildReportFrontMatter(meta)}# Body heading\n`;
		expect(parseReportFrontMatter(content)).toEqual(meta);
	});

	it("parses to null when there is no system front-matter", () => {
		expect(parseReportFrontMatter("# Just a body\n")).toBeNull();
		const legacy = "---\ntitle: Quarterly\nauthor: Mei\n---\n\n# Q\n";
		expect(parseReportFrontMatter(legacy)).toBeNull();
	});

	it("leaves a non-system leading YAML block intact (legacy/user content)", () => {
		// A pre-migration body that opens with a user/template front-matter block
		// lacking our signature keys must not be stripped.
		const legacy = "---\ntitle: Quarterly\nauthor: Mei\n---\n\n# Quarterly\n";
		const { frontMatter, body } = splitFrontMatter(legacy);
		expect(frontMatter).toBeNull();
		expect(body).toBe(legacy);
	});
});
