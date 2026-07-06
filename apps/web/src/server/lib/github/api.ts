/**
 * The single outbound choke point for GitHub API calls. Tests replace the
 * fetch implementation via `setGithubFetchForTests` — vitest-pool-workers
 * runs tests and the worker in one isolate, so module-level injection works
 * and no real network is touched (the installed pool version exports no
 * fetchMock).
 */

export class GithubApiError extends Error {
	constructor(
		readonly status: number,
		readonly path: string,
	) {
		super(`GitHub API ${status} for ${path}`);
	}
}

type FetchLike = typeof fetch;

let fetchImpl: FetchLike | null = null;

export function setGithubFetchForTests(impl: FetchLike | null): void {
	fetchImpl = impl;
}

const API_BASE = "https://api.github.com";

async function githubRequest<T>(
	path: string,
	init: {
		method?: string;
		token?: string;
		body?: unknown;
		/** Form-encoded body (the OAuth token endpoint's expected format). */
		form?: Record<string, string>;
		/** Absolute URL escape hatch for the two github.com (non-API) endpoints. */
		url?: string;
	},
): Promise<T> {
	const url = init.url ?? `${API_BASE}${path}`;
	// The two github.com (non-API) endpoints are not the REST API: the OAuth
	// token exchange returns form-encoded text unless plain JSON is requested,
	// and the API-version header does not apply there.
	const headers: Record<string, string> = init.url
		? { accept: "application/json", "user-agent": "spantail" }
		: {
				accept: "application/vnd.github+json",
				"x-github-api-version": "2022-11-28",
				// GitHub rejects requests without a User-Agent.
				"user-agent": "spantail",
			};
	if (init.token) headers.authorization = `Bearer ${init.token}`;
	let body: string | undefined;
	if (init.form !== undefined) {
		headers["content-type"] = "application/x-www-form-urlencoded";
		body = new URLSearchParams(init.form).toString();
	} else if (init.body !== undefined) {
		headers["content-type"] = "application/json";
		body = JSON.stringify(init.body);
	}
	const doFetch = fetchImpl ?? fetch;
	const response = await doFetch(url, {
		method: init.method ?? "GET",
		headers,
		body,
	});
	if (!response.ok) throw new GithubApiError(response.status, path);
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

export interface GithubIssue {
	title: string;
	labels: { name: string }[];
	html_url: string;
	pull_request?: unknown;
}

export async function getIssue(
	token: string,
	repoFullName: string,
	issueNumber: number,
): Promise<GithubIssue> {
	return githubRequest(`/repos/${repoFullName}/issues/${issueNumber}`, {
		token,
	});
}

export async function createIssueComment(
	token: string,
	repoFullName: string,
	issueNumber: number,
	body: string,
): Promise<void> {
	await githubRequest(`/repos/${repoFullName}/issues/${issueNumber}/comments`, {
		method: "POST",
		token,
		body: { body },
	});
}

export async function createCommentReaction(
	token: string,
	repoFullName: string,
	commentId: number,
	content: "+1",
): Promise<void> {
	await githubRequest(
		`/repos/${repoFullName}/issues/comments/${commentId}/reactions`,
		{ method: "POST", token, body: { content } },
	);
}

export interface GithubRepoSummary {
	id: number;
	full_name: string;
	private: boolean;
}

/** All repos the installation covers (paginated at GitHub's 100/page max). */
export async function listInstallationRepos(
	token: string,
): Promise<GithubRepoSummary[]> {
	const repos: GithubRepoSummary[] = [];
	for (let page = 1; page <= 10; page++) {
		const batch = await githubRequest<{ repositories: GithubRepoSummary[] }>(
			`/installation/repositories?per_page=100&page=${page}`,
			{ token },
		);
		repos.push(...batch.repositories);
		if (batch.repositories.length < 100) break;
	}
	return repos;
}

export interface GithubPullSummary {
	number: number;
	title: string;
	body: string | null;
}

/** PRs whose head is `owner:branch`, any state — the branch→issue signal. */
export async function listPullsByHead(
	token: string,
	repoFullName: string,
	headOwner: string,
	branch: string,
): Promise<GithubPullSummary[]> {
	return githubRequest(
		`/repos/${repoFullName}/pulls?head=${encodeURIComponent(`${headOwner}:${branch}`)}&state=all&per_page=5`,
		{ token },
	);
}

export interface ManifestConversion {
	id: number;
	slug: string;
	client_id: string;
	client_secret: string;
	webhook_secret: string;
	pem: string;
	owner: { login: string };
}

/** Exchanges the manifest flow's one-time code for the new App's credentials. */
export async function convertManifest(
	code: string,
): Promise<ManifestConversion> {
	return githubRequest(
		`/app-manifests/${encodeURIComponent(code)}/conversions`,
		{
			method: "POST",
		},
	);
}

export async function createInstallationToken(
	appJwt: string,
	installationId: number,
): Promise<{ token: string; expires_at: string }> {
	return githubRequest(`/app/installations/${installationId}/access_tokens`, {
		method: "POST",
		token: appJwt,
	});
}

/** The user-authorization code exchange (github.com, not the API host). */
export async function exchangeOauthCode(
	clientId: string,
	clientSecret: string,
	code: string,
): Promise<{ access_token: string }> {
	const result = await githubRequest<{
		access_token?: string;
		error?: string;
	}>("/login/oauth/access_token", {
		method: "POST",
		url: "https://github.com/login/oauth/access_token",
		// The token endpoint takes form-encoded parameters, not JSON.
		form: { client_id: clientId, client_secret: clientSecret, code },
	});
	if (!result.access_token) {
		throw new GithubApiError(400, "/login/oauth/access_token");
	}
	return { access_token: result.access_token };
}

export async function getAuthenticatedUser(
	token: string,
): Promise<{ id: number; login: string }> {
	return githubRequest("/user", { token });
}
