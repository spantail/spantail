import { expect, it } from "vitest";

import { CliError } from "./errors";
import { parseImportJsonl } from "./import-entries";

const line = (overrides: Record<string, unknown> = {}) =>
	JSON.stringify({
		project: "api",
		entryDate: "2026-06-01",
		durationMinutes: 60,
		description: "migrated",
		...overrides,
	});

it("parses JSONL tolerating BOM, CRLF, and blank lines", () => {
	const content = `﻿${line()}\r\n\n${line({ project: undefined, description: "second" })}\n`;
	const items = parseImportJsonl(content);
	expect(items).toHaveLength(2);
	expect(items[0]).toMatchObject({
		line: 1,
		project: "api",
		entry: { description: "migrated", durationMinutes: 60 },
	});
	// Line numbers are file positions, not item indexes.
	expect(items[1]).toMatchObject({ line: 3, project: undefined });
});

it("collects every error with its line number before failing", () => {
	const content = [
		line(),
		"not json",
		line({ durationMinutes: -5 }),
		line({ entryDate: undefined }),
	].join("\n");
	let error: unknown;
	try {
		parseImportJsonl(content);
	} catch (e) {
		error = e;
	}
	expect(error).toBeInstanceOf(CliError);
	const message = (error as CliError).message;
	expect(message).toContain("line 2: invalid JSON");
	expect(message).toContain("line 3: durationMinutes");
	expect(message).toContain("line 4: entryDate");
	expect(message).not.toContain("line 1");
});

it("caps the error listing and reports the remainder", () => {
	const content = Array.from({ length: 25 }, () => "broken").join("\n");
	let error: unknown;
	try {
		parseImportJsonl(content);
	} catch (e) {
		error = e;
	}
	const message = (error as CliError).message;
	expect(message).toContain("line 20");
	expect(message).not.toContain("line 21");
	expect(message).toContain("…and 5 more");
});

it("rejects duplicate externalIds pointing at the first occurrence", () => {
	const content = [
		line({ externalId: "legacy-1" }),
		line({ externalId: "legacy-2" }),
		line({ externalId: "legacy-1" }),
	].join("\n");
	expect(() => parseImportJsonl(content)).toThrowError(
		/line 3: duplicate externalId "legacy-1" \(first seen at line 1\)/,
	);
});

it("carries a valid author email and rejects a malformed one", () => {
	const items = parseImportJsonl(line({ user: "Dana@Example.com" }));
	// The email is lowercased so membership matching is case-insensitive.
	expect(items[0]?.entry).toMatchObject({ user: "dana@example.com" });

	expect(() => parseImportJsonl(line({ user: "not-an-email" }))).toThrowError(
		/line 1: user/,
	);
});

it("rejects an empty file", () => {
	expect(() => parseImportJsonl("\n\n")).toThrowError(/no entries in file/);
});
