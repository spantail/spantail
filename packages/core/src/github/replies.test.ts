import { describe, expect, it } from "vitest";

import { MAX_WORK_ENTRY_NOTE_LENGTH } from "../work-entry";
import { githubLogWorkNote } from "./replies";

const URL = "https://github.com/acme/spantail/issues/5";

describe("githubLogWorkNote", () => {
	it("returns the bare URL when no titles survive", () => {
		expect(githubLogWorkNote(URL, [])).toBe(URL);
		expect(githubLogWorkNote(URL, [null, "", "   "])).toBe(URL);
	});

	it("lists titles under a label, in order", () => {
		expect(githubLogWorkNote(URL, ["Fix auth", null, "Add tests"])).toBe(
			`${URL}\n\nAgent sessions:\n- Fix auth\n- Add tests`,
		);
	});

	it("flattens whitespace and deduplicates rendered titles", () => {
		expect(
			githubLogWorkNote(URL, [
				"Fix\nauth  bug",
				"Fix auth bug",
				" Fix auth bug ",
			]),
		).toBe(`${URL}\n\nAgent sessions:\n- Fix auth bug`);
	});

	it("truncates a single title to 200 characters", () => {
		const note = githubLogWorkNote(URL, ["x".repeat(500)]);
		expect(note).toBe(`${URL}\n\nAgent sessions:\n- ${"x".repeat(200)}`);
	});

	it("drops whole bullets over the note limit, most precise kept", () => {
		// 60 titles of 200 chars exceed the limit; the tail is dropped bullet by
		// bullet and the note never exceeds the schema max.
		const titles = Array.from(
			{ length: 60 },
			(_, i) => `${String(i).padStart(3, "0")}${"x".repeat(197)}`,
		);
		const note = githubLogWorkNote(URL, titles);
		expect(note.length).toBeLessThanOrEqual(MAX_WORK_ENTRY_NOTE_LENGTH);
		expect(note).toContain("- 000");
		expect(note).not.toContain("- 059");
	});

	it("falls back to the bare URL when even the first bullet cannot fit", () => {
		const longUrl = `${URL}?q=${"y".repeat(MAX_WORK_ENTRY_NOTE_LENGTH - 60)}`;
		expect(githubLogWorkNote(longUrl, ["a title"])).toBe(longUrl);
	});
});
