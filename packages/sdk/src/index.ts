import type {
	AcceptInvitationInput,
	AddWorkspaceMemberInputData,
	Agent,
	AgentEntry,
	AgentEntryStats,
	AgentEntryStatsQuery,
	AgentsEnabled,
	AgentWithToken,
	ApiToken,
	AuthProviders,
	AuthUser,
	Comment,
	CreateAgentInput,
	CreatedUser,
	CreateInvitationInputData,
	CreateProjectInput,
	CreateReportInput,
	CreateReportShareInput,
	CreateReportTemplateInput,
	CreateTokenInput,
	CreateUserInputData,
	CreateWorkEntryInputData,
	CreateWorkspaceInput,
	EmailEnabled,
	EmailSettings,
	IngestAgentEntryInputData,
	Invitation,
	InvitationPreview,
	ListAgentEntriesQueryData,
	ListInboxQueryData,
	ListReportsQueryData,
	ListWorkEntriesQueryData,
	MailFolder,
	MailFolderCounts,
	MailItem,
	MailItemDetail,
	ManagedUser,
	OauthSettings,
	Project,
	ReactionEmoji,
	ReactionSummary,
	Recipient,
	Report,
	ReportDiscussion,
	ReportMeta,
	ReportShare,
	ReportTemplate,
	SendReportInput,
	SendReportResult,
	SetMailFlagsInput,
	UnreadCount,
	UpdateAgentInput,
	UpdateAgentsEnabledInput,
	UpdateEmailSettingsInput,
	UpdateOauthSettingsInput,
	UpdateProjectInput,
	UpdateReportInput,
	UpdateReportTemplateInput,
	UpdateReportTemplateStateInput,
	UpdateUserInput,
	UpdateWorkEntryInput,
	UpdateWorkspaceInput,
	WorkEntry,
	WorkEntryStats,
	WorkEntryStatsQuery,
	WorkEntryTagsQuery,
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
	/**
	 * Programmatic client hint sent as the X-Toxil-Client header, which the
	 * server records as a work entry's source. Only "cli" / "mcp" are honored:
	 * "web" and "api" are derived server-side from the auth channel, so they are
	 * not offered here.
	 */
	client?: "cli" | "mcp";
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
	private readonly client?: "cli" | "mcp";

	constructor(options: ToxilClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, "");
		this.token = options.token;
		this.fetchImpl = options.fetch ?? ((...args) => globalThis.fetch(...args));
		this.client = options.client;
	}

	private async request<T>(
		method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
		path: string,
		options: { query?: Query; body?: unknown } = {},
	): Promise<T> {
		const url = new URL(`${this.baseUrl}/api/v1${path}`);
		for (const [key, value] of Object.entries(options.query ?? {})) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}

		const headers: Record<string, string> = {};
		if (this.token) headers.authorization = `Bearer ${this.token}`;
		if (this.client) headers["x-toxil-client"] = this.client;
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

	// --- Instance-wide user management (instance admin only) ---

	listUsers(): Promise<ManagedUser[]> {
		return this.request("GET", "/users");
	}

	createUser(input: CreateUserInputData): Promise<CreatedUser> {
		return this.request("POST", "/users", { body: input });
	}

	updateUser(id: string, input: UpdateUserInput): Promise<ManagedUser> {
		return this.request("PATCH", `/users/${id}`, { body: input });
	}

	deleteUser(id: string): Promise<void> {
		return this.request("DELETE", `/users/${id}`);
	}

	listInvitations(): Promise<Invitation[]> {
		return this.request("GET", "/invitations");
	}

	createInvitation(input: CreateInvitationInputData): Promise<Invitation> {
		return this.request("POST", "/invitations", { body: input });
	}

	revokeInvitation(id: string): Promise<void> {
		return this.request("DELETE", `/invitations/${id}`);
	}

	/** Public: validates an invitation token and returns the invited email. */
	getInvitation(token: string): Promise<InvitationPreview> {
		return this.request("GET", `/invitations/accept/${token}`);
	}

	/** Public: accepts an invitation, creating the account. */
	acceptInvitation(token: string, input: AcceptInvitationInput): Promise<void> {
		return this.request("POST", `/invitations/accept/${token}`, {
			body: input,
		});
	}

	/** Public: whether the instance can deliver email (gates self-service recovery). */
	getEmailEnabled(): Promise<EmailEnabled> {
		return this.request("GET", "/instance/email-enabled");
	}

	getEmailSettings(): Promise<EmailSettings> {
		return this.request("GET", "/instance/email");
	}

	updateEmailSettings(input: UpdateEmailSettingsInput): Promise<EmailSettings> {
		return this.request("PATCH", "/instance/email", { body: input });
	}

	/** Public: which social login providers the login screen should offer. */
	getAuthProviders(): Promise<AuthProviders> {
		return this.request("GET", "/instance/auth-providers");
	}

	getOauthSettings(): Promise<OauthSettings> {
		return this.request("GET", "/instance/oauth");
	}

	updateOauthSettings(input: UpdateOauthSettingsInput): Promise<OauthSettings> {
		return this.request("PATCH", "/instance/oauth", { body: input });
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

	deleteProject(id: string): Promise<void> {
		return this.request("DELETE", `/projects/${id}`);
	}

	listWorkEntries(query: ListWorkEntriesQueryData): Promise<WorkEntry[]> {
		return this.request("GET", "/work-entries", { query });
	}

	getWorkEntryStats(query: WorkEntryStatsQuery): Promise<WorkEntryStats> {
		return this.request("GET", "/work-entries/stats", { query });
	}

	listWorkEntryTags(query: WorkEntryTagsQuery): Promise<string[]> {
		return this.request("GET", "/work-entries/tags", { query });
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

	// --- AI agents: registry, access tokens, and work entries ---

	listAgents(): Promise<AgentWithToken[]> {
		return this.request("GET", "/agents");
	}

	/** Registers an agent and issues its access token; `secret` is shown once. */
	createAgent(
		input: CreateAgentInput,
	): Promise<AgentWithToken & { secret: string }> {
		return this.request("POST", "/agents", { body: input });
	}

	/** Toggles an agent's disabled state (its token is rejected while disabled). */
	updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
		return this.request("PATCH", `/agents/${id}`, { body: input });
	}

	/** Soft-deletes (archives) an agent; its entries are preserved. */
	deleteAgent(id: string): Promise<void> {
		return this.request("DELETE", `/agents/${id}`);
	}

	/** Regenerates the agent's token secret in place; returns it once. */
	rotateAgentToken(id: string): Promise<{ secret: string }> {
		return this.request("POST", `/agents/${id}/token/rotate`);
	}

	/** Ingests one agent session (agent access token auth). Idempotent. */
	ingestAgentEntry(input: IngestAgentEntryInputData): Promise<AgentEntry> {
		return this.request("POST", "/agent-entries", { body: input });
	}

	listAgentEntries(query: ListAgentEntriesQueryData): Promise<AgentEntry[]> {
		return this.request("GET", "/agent-entries", { query });
	}

	getAgentEntryStats(query: AgentEntryStatsQuery): Promise<AgentEntryStats> {
		return this.request("GET", "/agent-entries/stats", { query });
	}

	/** Agents with activity in a workspace (for the sidebar's Agents group). */
	listWorkspaceAgents(
		workspaceId: string,
	): Promise<Pick<Agent, "id" | "type" | "name">[]> {
		return this.request("GET", "/agent-entries/agents", {
			query: { workspaceId },
		});
	}

	/** Whether the instance has the agents feature enabled (gates the UI). */
	getAgentsEnabled(): Promise<AgentsEnabled> {
		return this.request("GET", "/instance/agents-enabled");
	}

	/** Instance admin: turn the agents feature on or off. */
	updateAgentsEnabled(input: UpdateAgentsEnabledInput): Promise<AgentsEnabled> {
		return this.request("PATCH", "/instance/agents", { body: input });
	}

	listReportTemplates(): Promise<ReportTemplate[]> {
		return this.request("GET", "/report-templates");
	}

	createReportTemplate(
		input: CreateReportTemplateInput,
	): Promise<ReportTemplate> {
		return this.request("POST", "/report-templates", { body: input });
	}

	getReportTemplate(id: string): Promise<ReportTemplate> {
		return this.request("GET", `/report-templates/${id}`);
	}

	updateReportTemplate(
		id: string,
		input: UpdateReportTemplateInput,
	): Promise<ReportTemplate> {
		return this.request("PATCH", `/report-templates/${id}`, { body: input });
	}

	/** Manager-only: toggle enabled / set cadence (builtin or custom template). */
	updateReportTemplateState(
		templateId: string,
		input: UpdateReportTemplateStateInput,
	): Promise<ReportTemplate> {
		return this.request("PATCH", `/report-templates/${templateId}/state`, {
			body: input,
		});
	}

	deleteReportTemplate(id: string): Promise<void> {
		return this.request("DELETE", `/report-templates/${id}`);
	}

	/** Metadata only (no rendered body); fetch the full report with getReport. */
	listReports(query: ListReportsQueryData = {}): Promise<ReportMeta[]> {
		return this.request("GET", "/reports", { query });
	}

	/** Distinct template ids that own at least one of the caller's reports. */
	listReportTemplateIdsInUse(): Promise<string[]> {
		return this.request("GET", "/reports/template-ids");
	}

	createReport(input: CreateReportInput): Promise<Report> {
		return this.request("POST", "/reports", { body: input });
	}

	getReport(id: string): Promise<Report> {
		return this.request("GET", `/reports/${id}`);
	}

	updateReport(id: string, input: UpdateReportInput): Promise<Report> {
		return this.request("PATCH", `/reports/${id}`, { body: input });
	}

	deleteReport(id: string): Promise<void> {
		return this.request("DELETE", `/reports/${id}`);
	}

	listReportShares(reportId: string): Promise<ReportShare[]> {
		return this.request("GET", `/reports/${reportId}/shares`);
	}

	createReportShare(
		reportId: string,
		input: CreateReportShareInput = {},
	): Promise<ReportShare> {
		return this.request("POST", `/reports/${reportId}/shares`, {
			body: input,
		});
	}

	revokeReportShare(shareId: string): Promise<ReportShare> {
		return this.request("POST", `/report-shares/${shareId}/revoke`);
	}

	// --- Internal "Send to" + inbox ---

	/** Candidate recipients for a report: its workspaces' members, minus you. */
	listReportRecipients(reportId: string): Promise<Recipient[]> {
		return this.request("GET", `/reports/${reportId}/recipients`);
	}

	/** Drops a frozen snapshot of the report into each recipient's inbox. */
	sendReport(
		reportId: string,
		input: SendReportInput,
	): Promise<SendReportResult> {
		return this.request("POST", `/reports/${reportId}/send`, { body: input });
	}

	/** Lists a mailbox folder. Defaults to the Inbox. */
	listInbox(
		folder: MailFolder = "inbox",
		query: Omit<ListInboxQueryData, "folder"> = {},
	): Promise<MailItem[]> {
		return this.request("GET", "/inbox", { query: { folder, ...query } });
	}

	getMailboxCounts(): Promise<MailFolderCounts> {
		return this.request("GET", "/inbox/counts");
	}

	getInboxUnreadCount(): Promise<UnreadCount> {
		return this.request("GET", "/inbox/unread-count");
	}

	/** Opens a mailbox item by delivery id; the server resolves received vs sent. */
	getInboxMessage(id: string): Promise<MailItemDetail> {
		return this.request("GET", `/inbox/${id}`);
	}

	/** Toggles the caller's flags (starred/archived/trashed) on a target. */
	setMailFlags(input: SetMailFlagsInput): Promise<void> {
		return this.request("PATCH", "/inbox/flags", { body: input });
	}

	markInboxRead(id: string): Promise<void> {
		return this.request("POST", `/inbox/${id}/read`);
	}

	markInboxUnread(id: string): Promise<void> {
		return this.request("POST", `/inbox/${id}/unread`);
	}

	markAllInboxRead(): Promise<void> {
		return this.request("POST", "/inbox/read-all");
	}

	// --- Report discussion (reactions + comments on Send-to-shared reports) ---

	getReportDiscussion(reportId: string): Promise<ReportDiscussion> {
		return this.request("GET", `/reports/${reportId}/discussion`);
	}

	/** Toggles an emoji on the report body; returns the body's reaction summary. */
	toggleReportReaction(
		reportId: string,
		emoji: ReactionEmoji,
	): Promise<ReactionSummary[]> {
		return this.request("PUT", `/reports/${reportId}/reactions`, {
			body: { emoji },
		});
	}

	addReportComment(reportId: string, body: string): Promise<Comment> {
		return this.request("POST", `/reports/${reportId}/comments`, {
			body: { body },
		});
	}

	updateReportComment(
		reportId: string,
		commentId: string,
		body: string,
	): Promise<Comment> {
		return this.request("PATCH", `/reports/${reportId}/comments/${commentId}`, {
			body: { body },
		});
	}

	deleteReportComment(reportId: string, commentId: string): Promise<void> {
		return this.request("DELETE", `/reports/${reportId}/comments/${commentId}`);
	}

	/** Toggles an emoji on a comment; returns that comment's reaction summary. */
	toggleReportCommentReaction(
		reportId: string,
		commentId: string,
		emoji: ReactionEmoji,
	): Promise<ReactionSummary[]> {
		return this.request(
			"PUT",
			`/reports/${reportId}/comments/${commentId}/reactions`,
			{ body: { emoji } },
		);
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
