import { expect, it } from "vitest";

import {
	matchRemoteToMapping,
	normalizeRemoteUrl,
	repoFullNameFromUrl,
} from "./repo";

it("normalizes scp-like and ssh remotes to https", () => {
	expect(normalizeRemoteUrl("git@github.com:acme/spantail.git")).toBe(
		"https://github.com/acme/spantail",
	);
	expect(normalizeRemoteUrl("ssh://git@github.com/acme/spantail.git")).toBe(
		"https://github.com/acme/spantail",
	);
});

it("strips embedded credentials from https remotes", () => {
	expect(
		normalizeRemoteUrl("https://user:token@github.com/acme/repo.git"),
	).toBe("https://github.com/acme/repo");
});

it("rejects non-URL remotes", () => {
	expect(normalizeRemoteUrl("/home/me/repos/spantail")).toBeNull();
	expect(normalizeRemoteUrl("../relative/path")).toBeNull();
});

it("extracts lowercased full names from github.com URLs only", () => {
	expect(repoFullNameFromUrl("git@github.com:Acme/Spantail.git")).toBe(
		"acme/spantail",
	);
	expect(repoFullNameFromUrl("https://github.com/acme/repo")).toBe("acme/repo");
	expect(repoFullNameFromUrl("https://github.com/acme/repo/")).toBe(
		"acme/repo",
	);
	expect(repoFullNameFromUrl("https://gitlab.com/acme/repo")).toBeNull();
	expect(
		repoFullNameFromUrl("https://github.example.com/acme/repo"),
	).toBeNull(); // GHES: v1 out of scope
	expect(repoFullNameFromUrl("https://github.com/acme")).toBeNull();
});

it("matches the first mapped remote in array order", () => {
	const mapped = ["acme/spantail", "acme/other"];
	expect(
		matchRemoteToMapping(
			[
				"https://gitlab.com/x/y",
				"git@github.com:acme/other.git",
				"https://github.com/acme/spantail",
			],
			mapped,
		),
	).toEqual({ fullName: "acme/other" });
	expect(
		matchRemoteToMapping(["https://github.com/no/match"], mapped),
	).toBeNull();
});
