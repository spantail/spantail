import {
	type BatchWorkEntryItem,
	batchWorkEntryItemSchema,
	MAX_PROJECTS_PER_BATCH,
	MAX_WORK_ENTRIES_PER_BATCH,
} from "@spantail/core";
import type { SpantailClient } from "@spantail/sdk";
import { z } from "zod";

import { CliError } from "./errors";
import { resolveWorkspace } from "./resolve";

/**
 * One JSONL line: the batch-entry fields plus an optional project slug. The
 * project is a slug (not an id) because the whole CLI addresses projects by
 * slug; lines without one fall back to the --project flag.
 */
export const importLineSchema = batchWorkEntryItemSchema
	.omit({ projectId: true })
	.extend({ project: z.string().min(1).optional() });

interface ImportItem {
	line: number;
	project: string | undefined;
	entry: Omit<BatchWorkEntryItem, "projectId">;
}

const MAX_REPORTED_ERRORS = 20;

function fileError(errors: string[]): CliError {
	const shown = errors.slice(0, MAX_REPORTED_ERRORS);
	const more = errors.length - shown.length;
	return new CliError(
		[...shown, ...(more > 0 ? [`…and ${more} more`] : [])].join("\n"),
	);
}

/**
 * Parses and validates a whole JSONL file before anything is sent to the API:
 * a single bad line fails the import with every error listed by line number.
 */
export function parseImportJsonl(content: string): ImportItem[] {
	// Strip a UTF-8 BOM; tolerate CRLF and blank lines.
	const lines = content.replace(/^\uFEFF/, "").split("\n");
	const items: ImportItem[] = [];
	const errors: string[] = [];
	const seenExternalIds = new Map<string, number>();

	lines.forEach((raw, index) => {
		const line = index + 1;
		const text = raw.replace(/\r$/, "");
		if (text.trim() === "") return;

		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch (error) {
			errors.push(
				`line ${line}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
			);
			return;
		}

		const result = importLineSchema.safeParse(parsed);
		if (!result.success) {
			const issue = result.error.issues[0];
			const path = issue?.path.join(".");
			errors.push(
				`line ${line}: ${path ? `${path}: ` : ""}${issue?.message ?? "invalid entry"}`,
			);
			return;
		}

		const { project, ...entry } = result.data;
		if (entry.externalId !== undefined) {
			const first = seenExternalIds.get(entry.externalId);
			if (first !== undefined) {
				errors.push(
					`line ${line}: duplicate externalId "${entry.externalId}" (first seen at line ${first})`,
				);
				return;
			}
			seenExternalIds.set(entry.externalId, line);
		}
		items.push({ line, project, entry });
	});

	if (errors.length > 0) throw fileError(errors);
	if (items.length === 0) throw new CliError("no entries in file");
	return items;
}

export interface ImportProgress {
	sent: number;
	total: number;
	request: number;
	requests: number;
}

export interface ImportSummary {
	imported: number;
	requests: number;
	dryRun: boolean;
	workspace: string;
	projects: string[];
	users: string[];
}

/**
 * Imports parsed JSONL content into one workspace: resolves project slugs to
 * ids (all before the first request), then posts the entries in batches of
 * MAX_WORK_ENTRIES_PER_BATCH, atomically per request. A mid-file failure
 * reports exactly which lines were imported and how to resume.
 *
 * An entry's `user` (an author's email) rides through unresolved — the server
 * maps it to an account — but when any line names an author (or --user is set)
 * every email is validated against the workspace's members here, so a dry run
 * reports an unknown author the same way it reports an unknown project. Naming
 * an author other than yourself requires instance admin; the server enforces
 * that and its error surfaces on the first request.
 */
export async function importEntries(
	client: SpantailClient,
	opts: {
		workspaceSlug: string;
		defaultProjectSlug?: string;
		defaultUserEmail?: string;
		content: string;
		dryRun?: boolean;
		onProgress?: (progress: ImportProgress) => void;
	},
): Promise<ImportSummary> {
	const items = parseImportJsonl(opts.content);
	const workspace = await resolveWorkspace(client, opts.workspaceSlug);
	const defaultUserEmail = opts.defaultUserEmail?.toLowerCase();

	// One projects lookup resolves every slug in the file.
	const projects = await client.listProjects(workspace.id);
	const idBySlug = new Map(projects.map((p) => [p.slug, p.id]));
	// Members are fetched only when authorship is in play, to validate emails.
	const authored =
		defaultUserEmail !== undefined ||
		items.some((item) => item.entry.user !== undefined);
	const memberEmails = authored
		? new Set(
				(await client.listMembers(workspace.id)).map((m) =>
					m.email.toLowerCase(),
				),
			)
		: null;
	const errors: string[] = [];
	const entries = items.map((item) => {
		const slug = item.project ?? opts.defaultProjectSlug;
		if (slug === undefined) {
			errors.push(
				`line ${item.line}: no project; add a "project" field or pass --project`,
			);
			return null;
		}
		const projectId = idBySlug.get(slug);
		if (projectId === undefined) {
			const available = projects.map((p) => p.slug).join(", ") || "none";
			errors.push(
				`line ${item.line}: unknown project "${slug}" in workspace "${workspace.slug}" (available: ${available})`,
			);
			return null;
		}
		const user = item.entry.user ?? defaultUserEmail;
		if (user !== undefined && memberEmails && !memberEmails.has(user)) {
			const available = [...memberEmails].join(", ") || "none";
			errors.push(
				`line ${item.line}: unknown user "${user}" in workspace "${workspace.slug}" (available: ${available})`,
			);
			return null;
		}
		return { line: item.line, entry: { ...item.entry, projectId, user } };
	});
	if (errors.length > 0) throw fileError(errors);
	const resolved = entries.filter((e) => e !== null);

	const usedSlugs = [
		...new Set(
			items
				.map((item) => item.project ?? opts.defaultProjectSlug)
				.filter((slug): slug is string => slug !== undefined),
		),
	];
	const usedEmails = [
		...new Set(
			items
				.map((item) => item.entry.user ?? defaultUserEmail)
				.filter((email): email is string => email !== undefined),
		),
	];
	// Chunk in file order, closing a request when it would exceed either the
	// entry cap or the distinct-project cap the API enforces per request.
	const chunks: (typeof resolved)[] = [];
	let current: typeof resolved = [];
	let currentProjects = new Set<string>();
	for (const item of resolved) {
		const overProjects =
			!currentProjects.has(item.entry.projectId) &&
			currentProjects.size >= MAX_PROJECTS_PER_BATCH;
		if (current.length >= MAX_WORK_ENTRIES_PER_BATCH || overProjects) {
			chunks.push(current);
			current = [];
			currentProjects = new Set<string>();
		}
		current.push(item);
		currentProjects.add(item.entry.projectId);
	}
	if (current.length > 0) chunks.push(current);

	const requests = chunks.length;
	const summary: ImportSummary = {
		imported: resolved.length,
		requests,
		dryRun: opts.dryRun === true,
		workspace: workspace.slug,
		projects: usedSlugs,
		users: usedEmails,
	};
	if (opts.dryRun) return summary;

	const allHaveExternalIds = items.every(
		(item) => item.entry.externalId !== undefined,
	);
	let sent = 0;
	for (const [request, chunk] of chunks.entries()) {
		try {
			await client.createWorkEntriesBatch({
				workspaceId: workspace.id,
				entries: chunk.map((c) => c.entry),
			});
		} catch (error) {
			// Each request is atomic but the file as a whole is not: report the
			// exact resume point.
			const lastImportedLine = sent > 0 ? resolved[sent - 1]?.line : undefined;
			const firstFailedLine = chunk[0]?.line;
			const resume = allHaveExternalIds
				? "Every line has an externalId, so re-running the same file is safe: already-imported entries are updated, not duplicated."
				: `Entries from line ${firstFailedLine} on were NOT imported; fix the error and re-run with only the remaining lines (lines without an externalId duplicate on re-import).`;
			throw new CliError(
				`request ${request + 1}/${requests} failed: ${error instanceof Error ? error.message : String(error)}\n` +
					`${sent} of ${resolved.length} entries were imported${lastImportedLine !== undefined ? ` (through line ${lastImportedLine})` : ""}. ${resume}`,
			);
		}
		sent += chunk.length;
		opts.onProgress?.({
			sent,
			total: resolved.length,
			request: request + 1,
			requests,
		});
	}
	return summary;
}
