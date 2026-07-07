import { expect, it } from "vitest";

import {
	branchMatchesIssue,
	parseGithubRef,
	refsMatchIssue,
} from "./issue-link";

it("matches GitHub's create-branch-from-issue convention", () => {
	expect(branchMatchesIssue("123-fix-auth", 123)).toBe(true);
	expect(branchMatchesIssue("123_fix_auth", 123)).toBe(true);
	expect(branchMatchesIssue("123", 123)).toBe(true);
});

it("matches prefixed and marker conventions", () => {
	expect(branchMatchesIssue("fix/123-auth", 123)).toBe(true);
	expect(branchMatchesIssue("feat/123_auth", 123)).toBe(true);
	expect(branchMatchesIssue("issue-123", 123)).toBe(true);
	expect(branchMatchesIssue("fix/issues/123", 123)).toBe(true);
	expect(branchMatchesIssue("gh-123", 123)).toBe(true);
	expect(branchMatchesIssue("work-on-#123", 123)).toBe(true);
});

it("does not match unrelated numbers", () => {
	expect(branchMatchesIssue("v123-release", 123)).toBe(false);
	expect(branchMatchesIssue("fix-1234-auth", 123)).toBe(false);
	expect(branchMatchesIssue("123fix", 123)).toBe(false);
	expect(branchMatchesIssue("main", 123)).toBe(false);
	// The #N form is bounded too: #12 must not match #123 / #1234.
	expect(branchMatchesIssue("work-on-#123", 12)).toBe(false);
	expect(branchMatchesIssue("fix/#1234", 123)).toBe(false);
	expect(branchMatchesIssue("work-on-#12", 12)).toBe(true);
	expect(branchMatchesIssue("#12-fix", 12)).toBe(true);
});

it("matches refs exactly, case-insensitively on the full name", () => {
	expect(refsMatchIssue(["github:Acme/Repo#5"], "acme/repo", 5)).toBe(true);
	expect(refsMatchIssue(["github:acme/repo#5"], "acme/repo", 55)).toBe(false);
	expect(refsMatchIssue(["github:acme/repo#55"], "acme/repo", 5)).toBe(false);
	expect(refsMatchIssue(["jira:ACME-5"], "acme/repo", 5)).toBe(false);
	expect(refsMatchIssue(undefined, "acme/repo", 5)).toBe(false);
});

it("parses a well-formed github ref", () => {
	expect(parseGithubRef("github:acme/repo#123")).toEqual({
		fullName: "acme/repo",
		number: 123,
	});
	// Full name is preserved verbatim (dedup lowercases at the call site).
	expect(parseGithubRef("github:Acme/My.Repo-1#7")).toEqual({
		fullName: "Acme/My.Repo-1",
		number: 7,
	});
});

it("rejects non-github, malformed, or non-numeric refs", () => {
	expect(parseGithubRef("jira:ACME-5")).toBeNull();
	expect(parseGithubRef("github:acme#5")).toBeNull(); // no repo segment
	expect(parseGithubRef("github:acme/repo")).toBeNull(); // no number
	expect(parseGithubRef("github:acme/repo#")).toBeNull();
	expect(parseGithubRef("github:acme/repo#12a")).toBeNull();
	expect(parseGithubRef("github:ac me/repo#5")).toBeNull(); // space
	expect(parseGithubRef("prefix github:acme/repo#5")).toBeNull(); // not anchored
});
