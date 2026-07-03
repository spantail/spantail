import { describe, expect, it } from "vitest";

import {
	buildReportFrontMatter,
	parseReportFrontMatter,
	type ReportFrontMatter,
	renderReportFrontMatterYaml,
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

	it("parses to null for a signature-key block that isn't the full shape", () => {
		// Carries the signature keys (so splitFrontMatter treats it as a header) but
		// lacks period/filters/etc — must not yield a partial object.
		const partial =
			"---\nversion: 1\ntemplateId: t1\ngeneratedAt: 2026-06-22T09:00:00.000Z\n---\n# Body\n";
		expect(parseReportFrontMatter(partial)).toBeNull();
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

describe("renderReportFrontMatterYaml", () => {
	it("renders the whole validated header, nothing omitted", () => {
		const full: ReportFrontMatter = {
			...meta,
			filters: {
				workspaceIds: ["ws-1", "ws-2", "ws-3"],
				projectIds: ["p-1"],
				tags: ["api"],
			},
		};
		const content = `${buildReportFrontMatter(full)}# Body\n`;
		const yaml = renderReportFrontMatterYaml(content);
		expect(yaml).not.toBeNull();
		// Every field surfaces verbatim — including each workspace id and the
		// preset, which the old header abbreviated to a count / dropped.
		for (const ws of full.filters.workspaceIds) {
			expect(yaml).toContain(ws);
		}
		expect(yaml).toContain("preset: last_week");
		expect(yaml).toContain("templateId: tmpl-weekly");
		// It round-trips: the displayed YAML re-parses to the same validated shape.
		expect(parseReportFrontMatter(`---\n${yaml}\n---\n# Body\n`)).toEqual(full);
	});

	it("returns null when the document has no system header", () => {
		expect(renderReportFrontMatterYaml("# Just a body\n")).toBeNull();
		const legacy = "---\ntitle: Quarterly\nauthor: Mei\n---\n\n# Q\n";
		expect(renderReportFrontMatterYaml(legacy)).toBeNull();
	});

	it("strips invisible/bidi control characters from hostile values", () => {
		const rlo = String.fromCharCode(0x202e); // right-to-left override
		const zwsp = String.fromCharCode(0x200b); // zero-width space
		const bell = String.fromCharCode(0x07); // C0 control
		const hostile: ReportFrontMatter = {
			...meta,
			name: `report${rlo}${zwsp}${bell}name`,
			filters: { workspaceIds: ["ws-1"] },
		};
		const content = `${buildReportFrontMatter(hostile)}# Body\n`;
		const yaml = renderReportFrontMatterYaml(content);
		expect(yaml).not.toBeNull();
		const line = yaml as string;
		// The spoofing/invisible characters are gone; visible letters remain.
		expect(line).not.toContain(rlo);
		expect(line).not.toContain(zwsp);
		expect(line).not.toContain(bell);
		expect(line).toContain("report");
		expect(line).toContain("name");
	});
});
