import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Project, WorkEntry, WorkspaceWithRole } from "@toxil/core";

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
				url.pathname === `/api/v1${candidate.path}`,
		);
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
		timezone: "Asia/Tokyo",
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

export interface TestContextOptions {
	env?: Record<string, string | undefined>;
	answers?: string[];
	interactive?: boolean;
	fetch?: typeof fetch;
}

export function createTestContext(options: TestContextOptions = {}) {
	const stdout = buffer();
	const stderr = buffer();
	const configDir = mkdtempSync(path.join(os.tmpdir(), "toxil-cli-test-"));
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
