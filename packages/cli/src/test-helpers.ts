import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
	Comment,
	MailItem,
	Project,
	Recipient,
	Report,
	ReportShare,
	ReportTemplate,
	WorkEntry,
	WorkspaceMember,
	WorkspaceWithRole,
} from "@spantail/core";

import type { CliContext } from "./context";
import type { Prompter } from "./prompt";

export interface Buffer {
	write(text: string): void;
	text(): string;
}

export function buffer(): Buffer {
	let text = "";
	return {
		write(chunk: string) {
			text += chunk;
		},
		text: () => text,
	};
}

export function scriptedPrompter(
	answers: string[],
	interactive: boolean,
): Prompter {
	const next = async () => {
		const answer = answers.shift();
		if (answer === undefined)
			throw new Error("scripted prompter ran out of answers");
		return answer;
	};
	return { interactive, ask: next, askHidden: next };
}

export interface FakeRoute {
	method?: string;
	/** Path under /api/v1, e.g. "/me". */
	path: string;
	status?: number;
	body: unknown;
	/** Consume this route after one match, so sequential calls can differ. */
	once?: boolean;
}

export interface FakeCall {
	method: string;
	url: URL;
	body: unknown;
	headers: Record<string, string>;
}

/** A fetch stub serving canned /api/v1 responses and recording calls. */
export function fakeApi(routes: FakeRoute[]) {
	const calls: FakeCall[] = [];
	const consumed = new Set<FakeRoute>();
	const fetchImpl = (async (input: unknown, init?: RequestInit) => {
		const url = new URL(String(input));
		const method = init?.method ?? "GET";
		calls.push({
			method,
			url,
			body:
				init?.body === undefined ? undefined : JSON.parse(String(init.body)),
			headers: (init?.headers ?? {}) as Record<string, string>,
		});
		const route = routes.find(
			(candidate) =>
				(candidate.method ?? "GET") === method &&
				url.pathname === `/api/v1${candidate.path}` &&
				!consumed.has(candidate),
		);
		if (route?.once) consumed.add(route);
		if (!route) {
			return new Response(
				JSON.stringify({
					error: {
						code: "not_found",
						message: `no fake route for ${method} ${url.pathname}`,
					},
				}),
				{ status: 404 },
			);
		}
		return new Response(JSON.stringify(route.body), {
			status: route.status ?? 200,
		});
	}) as typeof fetch;
	return { fetch: fetchImpl, calls };
}

export function workspaceFixture(
	slug: string,
	role: WorkspaceWithRole["role"] = "member",
): WorkspaceWithRole {
	return {
		id: `ws-${slug}`,
		slug,
		name: slug.toUpperCase(),
		accentColor: "neutral",
		logoUrl: null,
		settings: {},
		createdAt: "2026-06-01T00:00:00Z",
		archivedAt: null,
		role,
	};
}

export function projectFixture(
	slug: string,
	workspaceId: string,
	status: Project["status"] = "active",
): Project {
	return {
		id: `proj-${slug}`,
		workspaceId,
		slug,
		name: slug.toUpperCase(),
		description: null,
		hue: 264,
		symbol: "circle",
		status,
		createdAt: "2026-06-01T00:00:00Z",
		archivedAt: null,
	};
}

export function entryFixture(overrides: Partial<WorkEntry> = {}): WorkEntry {
	return {
		id: "entry-1",
		workspaceId: "ws-acme",
		projectId: "proj-api",
		userId: "u1",
		entryDate: "2026-06-12",
		durationMinutes: 90,
		startedAt: null,
		endedAt: null,
		description: "Did things",
		note: null,
		tags: [],
		source: "cli",
		createdAt: "2026-06-12T00:00:00Z",
		updatedAt: "2026-06-12T00:00:00Z",
		...overrides,
	};
}

export function memberFixture(
	overrides: Partial<WorkspaceMember> = {},
): WorkspaceMember {
	return {
		workspaceId: "ws-acme",
		userId: "u1",
		role: "member",
		name: "Alice",
		email: "alice@example.com",
		imageUrl: null,
		createdAt: "2026-06-01T00:00:00Z",
		...overrides,
	};
}

export function reportFixture(overrides: Partial<Report> = {}): Report {
	return {
		id: "rep-1",
		name: "Weekly report",
		ownerUserId: "u1",
		templateId: "tpl-1",
		filters: {
			workspaceIds: ["ws-acme"],
			dateRange: { from: "2026-06-08", to: "2026-06-14" },
		},
		note: null,
		totalMinutes: 120,
		version: 1,
		renderedMarkdown: "# Weekly report\n",
		createdAt: "2026-06-14T00:00:00Z",
		updatedAt: "2026-06-14T00:00:00Z",
		...overrides,
	};
}

export function templateFixture(
	overrides: Partial<ReportTemplate> = {},
): ReportTemplate {
	return {
		id: "tpl-1",
		name: "Weekly",
		description: null,
		body: "# {{ report.name }}",
		enabled: true,
		isDefault: true,
		nameTemplate: null,
		noteTemplate: null,
		defaultDateRange: null,
		createdBy: null,
		createdAt: "2026-06-01T00:00:00Z",
		updatedAt: "2026-06-01T00:00:00Z",
		...overrides,
	};
}

export function recipientFixture(
	overrides: Partial<Recipient> = {},
): Recipient {
	return {
		id: "u2",
		name: "Bob",
		email: "bob@example.com",
		imageUrl: null,
		...overrides,
	};
}

export function shareFixture(
	overrides: Partial<ReportShare> = {},
): ReportShare {
	return {
		id: "share-1",
		reportContentId: "rep-1-v1",
		token: "tok_abcdefghijklmnopqr",
		hasPasscode: false,
		expiresAt: null,
		revokedAt: null,
		viewCount: 0,
		lastViewedAt: null,
		createdAt: "2026-06-14T00:00:00Z",
		...overrides,
	};
}

export function commentFixture(overrides: Partial<Comment> = {}): Comment {
	return {
		id: "com-1",
		reportId: "rep-1",
		authorUserId: "u2",
		authorName: "Bob",
		authorImageUrl: null,
		body: "Nice work!",
		createdAt: "2026-06-14T10:00:00Z",
		updatedAt: "2026-06-14T10:00:00Z",
		editable: false,
		reactions: [],
		...overrides,
	};
}

export function mailItemFixture(overrides: Partial<MailItem> = {}): MailItem {
	return {
		id: "mail-1",
		scope: "received",
		batchId: "batch-1",
		reportId: "rep-1",
		senderName: "Bob",
		senderEmail: "bob@example.com",
		senderImageUrl: null,
		reportName: "Weekly report",
		dateFrom: "2026-06-08",
		dateTo: "2026-06-14",
		message: null,
		readAt: null,
		createdAt: "2026-06-14T12:00:00Z",
		starred: false,
		archived: false,
		trashed: false,
		recipientNames: [],
		recipientImageUrls: [],
		recipientCount: 0,
		...overrides,
	};
}

export interface TestContextOptions {
	env?: Record<string, string | undefined>;
	answers?: string[];
	interactive?: boolean;
	fetch?: typeof fetch;
}

export function createTestContext(options: TestContextOptions = {}) {
	const stdout = buffer();
	const stderr = buffer();
	const configDir = mkdtempSync(path.join(os.tmpdir(), "spantail-cli-test-"));
	const ctx: CliContext = {
		env: options.env ?? {},
		stdout,
		stderr,
		prompter: scriptedPrompter(
			options.answers ?? [],
			options.interactive ?? true,
		),
		configDir,
		fetch: options.fetch,
	};
	return { ctx, stdout, stderr, configDir };
}
