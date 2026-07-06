import { z } from "zod";

import { workEntrySchema } from "../work-entry";

/** Request/response shapes for the GitHub integration API surface. */

/**
 * UC2: log work against a GitHub issue from a client that only knows its git
 * remotes. The server resolves the project via the repo mapping and parses
 * `args` — clients never parse and hold no project id (issue #159).
 */
export const logWorkFromGithubInputSchema = z.object({
	// `git remote -v` fetch URLs, verbatim; the server normalizes and matches.
	remotes: z.array(z.string().min(1).max(500)).min(1).max(10),
	issueNumber: z.number().int().positive().max(10_000_000),
	// Raw "<duration> [date]" string, exactly as the user typed it.
	args: z.string().max(200),
});
export type LogWorkFromGithubInput = z.infer<
	typeof logWorkFromGithubInputSchema
>;

export const logWorkFromGithubResultSchema = z.object({
	entry: workEntrySchema,
	resolved: z.object({
		repo: z.string(),
		workspaceId: z.string(),
		projectId: z.string(),
		projectName: z.string(),
		issue: z.object({
			number: z.number().int(),
			title: z.string().nullable(),
			url: z.string(),
		}),
		tags: z.array(z.string()),
		linkedAgentEntryIds: z.array(z.string()),
		// True when issue metadata could not be fetched (no App, or API failure)
		// and the entry was created with the bare "#N" description.
		degraded: z.boolean(),
	}),
});
export type LogWorkFromGithubResult = z.infer<
	typeof logWorkFromGithubResultSchema
>;

/** Owner account the App manifest is submitted to (null = personal account). */
export const githubManifestInitInputSchema = z.object({
	owner: z.string().min(1).max(100).nullable(),
});
export type GithubManifestInitInput = z.infer<
	typeof githubManifestInitInputSchema
>;

export const githubRepoFullNameSchema = z
	.string()
	.min(3)
	.max(140)
	.regex(
		/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/,
		"must be an owner/repo full name",
	);

export const createGithubMappingInputSchema = z.object({
	repoFullName: githubRepoFullNameSchema,
	projectId: z.string(),
});
export type CreateGithubMappingInput = z.infer<
	typeof createGithubMappingInputSchema
>;

export const githubMappingSources = ["installation", "manual"] as const;
export type GithubMappingSource = (typeof githubMappingSources)[number];

// Response shapes of the GitHub settings surface, shared by server and SDK.

export interface GithubAppStatus {
	app: {
		appId: number;
		slug: string;
		ownerLogin: string;
		createdAt: string;
	} | null;
	installations: {
		installationId: number;
		accountLogin: string;
		accountType: "User" | "Organization";
		suspended: boolean;
	}[];
}

export interface GithubInstallationRepo {
	repoId: number;
	fullName: string;
	private: boolean;
	mapped: boolean;
}

export interface GithubMapping {
	id: string;
	repoFullName: string;
	projectId: string;
	projectName: string;
	source: GithubMappingSource;
	createdAt: string;
}

export interface GithubUnmappedRepo {
	repoId: number;
	fullName: string;
	private: boolean;
}

export type GithubIdentityStatus =
	| { linked: true; login: string }
	| { linked: false };
