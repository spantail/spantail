import type {
	AddWorkspaceMemberInputData,
	ApiToken,
	AuthUser,
	CreateProjectInput,
	CreateTokenInput,
	CreateWorkEntryInputData,
	CreateWorkspaceInput,
	ListWorkEntriesQueryData,
	Project,
	UpdateProjectInput,
	UpdateWorkEntryInput,
	UpdateWorkspaceInput,
	WorkEntry,
	Workspace,
	WorkspaceMember,
	WorkspaceWithRole,
} from "@toxil/core";

export interface Me {
	user: AuthUser;
	memberships: WorkspaceWithRole[];
}

export interface ToxilClientOptions {
	/** Absolute base URL of the Toxil instance, e.g. https://toxil.example.com */
	baseUrl: string;
	/** API token (PAT) sent as a Bearer Authorization header. */
	token?: string;
	/** Custom fetch implementation (e.g. an in-process loopback in a Worker). */
	fetch?: typeof fetch;
}

export class ToxilApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "ToxilApiError";
	}
}

type Query = Record<string, string | number | undefined>;

export class ToxilClient {
	private readonly baseUrl: string;
	private readonly token?: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: ToxilClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, "");
		this.token = options.token;
		this.fetchImpl = options.fetch ?? ((...args) => globalThis.fetch(...args));
	}

	private async request<T>(
		method: "GET" | "POST" | "PATCH" | "DELETE",
		path: string,
		options: { query?: Query; body?: unknown } = {},
	): Promise<T> {
		const url = new URL(`${this.baseUrl}/api/v1${path}`);
		for (const [key, value] of Object.entries(options.query ?? {})) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}

		const headers: Record<string, string> = {};
		if (this.token) headers.authorization = `Bearer ${this.token}`;
		if (options.body !== undefined)
			headers["content-type"] = "application/json";

		const res = await this.fetchImpl(url.toString(), {
			method,
			headers,
			body:
				options.body === undefined ? undefined : JSON.stringify(options.body),
		});

		if (res.status === 204) return undefined as T;
		const payload = (await res.json().catch(() => null)) as {
			error?: { code?: string; message?: string };
		} | null;
		if (!res.ok) {
			throw new ToxilApiError(
				res.status,
				payload?.error?.code ?? "unknown",
				payload?.error?.message ?? `Request failed with status ${res.status}`,
			);
		}
		return payload as T;
	}

	me(): Promise<Me> {
		return this.request("GET", "/me");
	}

	listWorkspaces(): Promise<WorkspaceWithRole[]> {
		return this.request("GET", "/workspaces");
	}

	createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
		return this.request("POST", "/workspaces", { body: input });
	}

	getWorkspace(id: string): Promise<Workspace> {
		return this.request("GET", `/workspaces/${id}`);
	}

	updateWorkspace(id: string, input: UpdateWorkspaceInput): Promise<Workspace> {
		return this.request("PATCH", `/workspaces/${id}`, { body: input });
	}

	listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
		return this.request("GET", `/workspaces/${workspaceId}/members`);
	}

	addMember(
		workspaceId: string,
		input: AddWorkspaceMemberInputData,
	): Promise<WorkspaceMember> {
		return this.request("POST", `/workspaces/${workspaceId}/members`, {
			body: input,
		});
	}

	removeMember(workspaceId: string, userId: string): Promise<void> {
		return this.request(
			"DELETE",
			`/workspaces/${workspaceId}/members/${userId}`,
		);
	}

	listProjects(workspaceId: string): Promise<Project[]> {
		return this.request("GET", `/workspaces/${workspaceId}/projects`);
	}

	createProject(
		workspaceId: string,
		input: CreateProjectInput,
	): Promise<Project> {
		return this.request("POST", `/workspaces/${workspaceId}/projects`, {
			body: input,
		});
	}

	getProject(id: string): Promise<Project> {
		return this.request("GET", `/projects/${id}`);
	}

	updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
		return this.request("PATCH", `/projects/${id}`, { body: input });
	}

	listWorkEntries(query: ListWorkEntriesQueryData): Promise<WorkEntry[]> {
		return this.request("GET", "/work-entries", { query });
	}

	createWorkEntry(input: CreateWorkEntryInputData): Promise<WorkEntry> {
		return this.request("POST", "/work-entries", { body: input });
	}

	getWorkEntry(id: string): Promise<WorkEntry> {
		return this.request("GET", `/work-entries/${id}`);
	}

	updateWorkEntry(id: string, input: UpdateWorkEntryInput): Promise<WorkEntry> {
		return this.request("PATCH", `/work-entries/${id}`, { body: input });
	}

	deleteWorkEntry(id: string): Promise<void> {
		return this.request("DELETE", `/work-entries/${id}`);
	}

	listTokens(): Promise<ApiToken[]> {
		return this.request("GET", "/tokens");
	}

	createToken(input: CreateTokenInput): Promise<ApiToken & { token: string }> {
		return this.request("POST", "/tokens", { body: input });
	}

	deleteToken(id: string): Promise<void> {
		return this.request("DELETE", `/tokens/${id}`);
	}
}
