import { expect, it } from "vitest";

import { branchMatchesIssue, refsMatchIssue } from "./issue-link";

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
