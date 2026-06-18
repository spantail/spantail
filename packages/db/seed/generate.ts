import { randomUUID } from "node:crypto";
import {
	generateShareToken,
	getBuiltinTemplate,
	lastDayOfMonth,
	type ReportContextInput,
	type ReportFilters,
	renderReport,
	shiftDays,
	todayInTimezone,
	zonedDateTimeToUtc,
} from "@toxil/core";
import { hashPassword } from "better-auth/crypto";

import {
	type Language,
	loadConfig,
	type SeedConfig,
	type WorkspaceConfig,
} from "./schema";

/** Shared password for every seeded user. Documented in seed/README.md. */
export const SEED_PASSWORD = "password";
const WINDOW_DAYS = 45;

type Row = Record<string, unknown>;

export interface SeededTable {
	/** Drizzle schema property name on the `schema` namespace export. */
	table: string;
	rows: Row[];
}

export interface Dataset {
	/** In dependency order so a single SQL file inserts cleanly. */
	tables: SeededTable[];
	r2: Array<{ key: string; body: string }>;
	credentials: Array<{ name: string; email: string }>;
	summary: Record<string, number>;
}

interface ResolvedUser {
	id: string;
	key: string;
	name: string;
	email: string;
	home: WorkspaceConfig;
}
interface ResolvedWorkspace {
	id: string;
	key: string;
	slug: string;
	name: string;
	timezone: string;
	language: Language;
	client: boolean;
}
interface ResolvedProject {
	id: string;
	key: string;
	slug: string;
	name: string;
	workspace: ResolvedWorkspace;
}
interface EntryRecord {
	id: string;
	user: ResolvedUser;
	workspace: ResolvedWorkspace;
	project: ResolvedProject;
	date: string;
	minutes: number;
	description: string;
	tags: string[];
}

function pick<T>(pool: T[], index: number): T {
	return pool[index % pool.length] as T;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const existing = map.get(key);
	if (existing) existing.push(value);
	else map.set(key, [value]);
}

/** Mon–Fri (UTC calendar weekday of a YYYY-MM-DD date). */
function isWeekday(date: string): boolean {
	const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
	return dow >= 1 && dow <= 5;
}

function toEngineEntry(e: EntryRecord): ReportContextInput["entries"][number] {
	return {
		id: e.id,
		workspaceId: e.workspace.id,
		projectId: e.project.id,
		userId: e.user.id,
		entryDate: e.date,
		durationMinutes: e.minutes,
		description: e.description,
		note: null,
		tags: e.tags,
	};
}

/**
 * Builds the full demo dataset for a given "now". Pure and deterministic apart
 * from the random ids/share tokens, so it is unit-testable with a fixed clock.
 */
export async function generateDataset(now: Date): Promise<Dataset> {
	const config = loadConfig();

	const password = await hashPassword(SEED_PASSWORD);
	// Anchor account/workspace creation comfortably before the activity window.
	const baseCreatedAt = new Date(now.getTime() - 90 * 86_400_000);

	// --- Workspaces ---------------------------------------------------------
	const wsByKey = new Map<string, ResolvedWorkspace>();
	const workspaceRows: Row[] = [];
	for (const w of config.workspaces) {
		const ws: ResolvedWorkspace = {
			id: randomUUID(),
			key: w.key,
			slug: w.slug,
			name: w.name,
			timezone: w.timezone,
			language: w.language,
			client: w.client,
		};
		wsByKey.set(w.key, ws);
		workspaceRows.push({
			id: ws.id,
			slug: ws.slug,
			name: ws.name,
			timezone: ws.timezone,
			settings: {},
			createdAt: baseCreatedAt,
			archivedAt: null,
		});
	}

	// --- Users + credential accounts ---------------------------------------
	const usersByKey = new Map<string, ResolvedUser>();
	const userRows: Row[] = [];
	const accountRows: Row[] = [];
	for (const u of config.users) {
		const home = config.workspaces.find((w) => w.key === u.homeWorkspace);
		if (!home) throw new Error(`unknown homeWorkspace for ${u.key}`);
		const id = randomUUID();
		const user: ResolvedUser = {
			id,
			key: u.key,
			name: u.name,
			email: u.email,
			home,
		};
		usersByKey.set(u.key, user);
		userRows.push({
			id,
			name: u.name,
			email: u.email,
			emailVerified: true,
			image: null,
			isAdmin: u.isAdmin,
			canManageTemplates: u.canManageTemplates,
			createdAt: baseCreatedAt,
			updatedAt: baseCreatedAt,
		});
		accountRows.push({
			id: randomUUID(),
			accountId: id,
			providerId: "credential",
			userId: id,
			password,
			createdAt: baseCreatedAt,
			updatedAt: baseCreatedAt,
		});
	}

	// --- Memberships + per-workspace manager (report recipient) -------------
	const memberRows: Row[] = [];
	const managerByWs = new Map<string, ResolvedUser>();
	const workspacesByUser = new Map<string, ResolvedWorkspace[]>();
	for (const m of config.members) {
		const ws = wsByKey.get(m.workspace);
		const user = usersByKey.get(m.user);
		if (!ws || !user) throw new Error("dangling member reference");
		memberRows.push({
			workspaceId: ws.id,
			userId: user.id,
			role: m.role,
			createdAt: baseCreatedAt,
		});
		// owner wins over admin as the manager.
		if (
			m.role === "owner" ||
			(m.role === "admin" && !managerByWs.has(ws.key))
		) {
			managerByWs.set(ws.key, user);
		}
		const list = workspacesByUser.get(user.key) ?? [];
		list.push(ws);
		workspacesByUser.set(user.key, list);
	}

	// --- Projects -----------------------------------------------------------
	const projByKey = new Map<string, ResolvedProject>();
	const projectRows: Row[] = [];
	for (const p of config.projects) {
		const ws = wsByKey.get(p.workspace);
		if (!ws) throw new Error(`unknown workspace for project ${p.key}`);
		const proj: ResolvedProject = {
			id: randomUUID(),
			key: p.key,
			slug: p.slug,
			name: p.name,
			workspace: ws,
		};
		projByKey.set(p.key, proj);
		projectRows.push({
			id: proj.id,
			workspaceId: ws.id,
			slug: p.slug,
			name: p.name,
			description: p.description ?? null,
			status: "active",
			createdAt: baseCreatedAt,
			archivedAt: null,
		});
	}

	// --- Templates (4: daily/monthly × en/ja) ------------------------------
	const author =
		[...usersByKey.values()].find((u) => {
			const cfg = config.users.find((c) => c.key === u.key);
			return cfg?.canManageTemplates || cfg?.isAdmin;
		}) ?? [...usersByKey.values()][0];
	const templateRows: Row[] = [];
	const templateByLangUnit = new Map<string, { id: string; body: string }>();
	for (const t of config.templates) {
		const body = t.body ?? getBuiltinTemplate(t.bodyFrom ?? "")?.body;
		if (!body)
			throw new Error(`template ${t.key}: unknown bodyFrom ${t.bodyFrom}`);
		const id = randomUUID();
		templateRows.push({
			id,
			name: t.name,
			description: t.description ?? null,
			body,
			enabled: true,
			periodUnit: t.periodUnit,
			createdBy: author?.id ?? null,
			createdAt: baseCreatedAt,
			updatedAt: baseCreatedAt,
		});
		templateByLangUnit.set(`${t.language}:${t.periodUnit}`, { id, body });
	}
	const templateFor = (language: Language, unit: "day" | "month") => {
		const t = templateByLangUnit.get(`${language}:${unit}`);
		if (!t) throw new Error(`no ${language} ${unit} template`);
		return t;
	};

	// --- Work entries (last 45 days, weekdays, 8h/day) ---------------------
	const entryRows: Row[] = [];
	// user.key -> date -> entries (for daily reports)
	const entriesByUserDate = new Map<string, Map<string, EntryRecord[]>>();
	// user.key -> ws.key -> entries (for monthly reports)
	const entriesByUserWs = new Map<string, Map<string, EntryRecord[]>>();

	for (const user of usersByKey.values()) {
		const allocation = config.workPatterns.allocations[user.key] ?? [];
		const anchor = todayInTimezone(user.home.timezone, now);
		const dates: string[] = [];
		for (let back = WINDOW_DAYS - 1; back >= 0; back--) {
			const date = shiftDays(anchor, -back);
			if (isWeekday(date)) dates.push(date);
		}
		const byDate = new Map<string, EntryRecord[]>();
		const byWs = new Map<string, EntryRecord[]>();
		entriesByUserDate.set(user.key, byDate);
		entriesByUserWs.set(user.key, byWs);

		dates.forEach((date, dayIndex) => {
			allocation.forEach((line, lineIndex) => {
				const project = projByKey.get(line.project);
				if (!project) throw new Error(`unknown project ${line.project}`);
				const lang = project.workspace.language;
				const descTemplate = pick(
					config.workPatterns.descriptions[lang],
					dayIndex + lineIndex,
				);
				const description = descTemplate.split("{project}").join(project.name);
				const tags = [
					pick(config.workPatterns.tags[lang], dayIndex + lineIndex + 2),
				];
				const record: EntryRecord = {
					id: randomUUID(),
					user,
					workspace: project.workspace,
					project,
					date,
					minutes: line.minutes,
					description,
					tags,
				};
				const createdAt = new Date(
					zonedDateTimeToUtc(date, "18:00", user.home.timezone),
				);
				entryRows.push({
					id: record.id,
					workspaceId: project.workspace.id,
					projectId: project.id,
					userId: user.id,
					entryDate: date,
					durationMinutes: line.minutes,
					startedAt: null,
					endedAt: null,
					description,
					note: null,
					tags,
					createdAt,
					updatedAt: createdAt,
				});
				pushTo(byDate, date, record);
				pushTo(byWs, project.workspace.key, record);
			});
		});
	}

	// --- Reports / deliveries / shares -------------------------------------
	const reportRows: Row[] = [];
	const deliveryRows: Row[] = [];
	const shareRows: Row[] = [];
	const r2: Array<{ key: string; body: string }> = [];
	const readBefore = shiftDays(todayInTimezone("UTC", now), -3);

	const recipientsForWorkspaces = (wsKeys: string[], senderKey: string) => {
		const ids = new Map<string, ResolvedUser>();
		for (const wsKey of wsKeys) {
			const manager = managerByWs.get(wsKey);
			if (manager && manager.key !== senderKey) ids.set(manager.id, manager);
		}
		return [...ids.values()];
	};

	const addDeliveries = (
		report: {
			id: string;
			name: string;
			sender: ResolvedUser;
			rendered: string;
		},
		recipients: ResolvedUser[],
		dateFrom: string,
		dateTo: string,
		createdAt: Date,
		read: boolean,
	) => {
		if (recipients.length === 0) return;
		const batchId = randomUUID();
		for (const r of recipients) {
			deliveryRows.push({
				id: randomUUID(),
				reportId: report.id,
				senderUserId: report.sender.id,
				recipientUserId: r.id,
				batchId,
				senderName: report.sender.name,
				senderEmail: report.sender.email,
				reportName: report.name,
				dateFrom,
				dateTo,
				renderedMarkdown: report.rendered,
				message: null,
				readAt: read ? new Date(createdAt.getTime() + 3_600_000) : null,
				createdAt,
			});
		}
	};

	// Daily, cross-workspace, one per member per working day.
	for (const user of usersByKey.values()) {
		const lang = user.home.language;
		const tmpl = templateFor(lang, "day");
		const byDate =
			entriesByUserDate.get(user.key) ?? new Map<string, EntryRecord[]>();
		for (const [date, entries] of [...byDate.entries()].sort()) {
			const scopedWs = [
				...new Map(entries.map((e) => [e.workspace.key, e.workspace])).values(),
			];
			const scopedProjects = [
				...new Map(entries.map((e) => [e.project.key, e.project])).values(),
			];
			const name = lang === "ja" ? `日報 — ${date}` : `Daily report — ${date}`;
			const createdAt = new Date(
				zonedDateTimeToUtc(date, "18:30", user.home.timezone),
			);
			const filters: ReportFilters = {
				workspaceIds: scopedWs.map((w) => w.id),
				userIds: [user.id],
				dateRange: { from: date, to: date },
			};
			const context: ReportContextInput = {
				report: { name, note: null },
				period: { from: date, to: date, preset: null },
				timezone: user.home.timezone,
				generatedAt: createdAt,
				workspaces: scopedWs.map((w) => ({
					id: w.id,
					slug: w.slug,
					name: w.name,
					timezone: w.timezone,
				})),
				projects: scopedProjects.map((p) => ({
					id: p.id,
					slug: p.slug,
					name: p.name,
					workspaceId: p.workspace.id,
				})),
				users: [{ id: user.id, name: user.name }],
				entries: entries.map(toEngineEntry),
			};
			const rendered = await renderReport(tmpl.body, context);
			const id = randomUUID();
			reportRows.push({
				id,
				name,
				ownerUserId: user.id,
				templateId: tmpl.id,
				filters,
				note: null,
				totalMinutes: entries.reduce((a, e) => a + e.minutes, 0),
				renderedMarkdown: rendered,
				createdAt,
				updatedAt: createdAt,
			});
			addDeliveries(
				{ id, name, sender: user, rendered },
				recipientsForWorkspaces(
					scopedWs.map((w) => w.key),
					user.key,
				),
				date,
				date,
				createdAt,
				date <= readBefore,
			);
		}
	}

	// Monthly, per workspace, for completed months inside the window.
	const anchorUtc = todayInTimezone("UTC", now);
	const windowStart = shiftDays(anchorUtc, -(WINDOW_DAYS - 1));
	const [ay = 0, am = 1] = anchorUtc.split("-").map(Number);
	const targetMonths: Array<{ first: string; last: string; ym: string }> = [];
	for (let offset = 1; offset <= 2; offset++) {
		const first = new Date(Date.UTC(ay, am - 1 - offset, 1));
		const firstStr = first.toISOString().slice(0, 10);
		const lastStr = lastDayOfMonth(first.getUTCFullYear(), first.getUTCMonth());
		if (lastStr <= anchorUtc && lastStr >= windowStart) {
			targetMonths.push({
				first: firstStr,
				last: lastStr,
				ym: firstStr.slice(0, 7),
			});
		}
	}

	for (const user of usersByKey.values()) {
		const byWs =
			entriesByUserWs.get(user.key) ?? new Map<string, EntryRecord[]>();
		for (const ws of workspacesByUser.get(user.key) ?? []) {
			const tmpl = templateFor(ws.language, "month");
			for (const month of targetMonths) {
				const entries = (byWs.get(ws.key) ?? []).filter(
					(e) => e.date >= month.first && e.date <= month.last,
				);
				if (entries.length === 0) continue;
				const scopedProjects = [
					...new Map(entries.map((e) => [e.project.key, e.project])).values(),
				];
				const name =
					ws.language === "ja"
						? `月報 — ${ws.name} — ${month.ym}`
						: `Monthly report — ${ws.name} — ${month.ym}`;
				const note =
					ws.language === "ja"
						? "今月の作業実績のまとめです。"
						: "Summary of work delivered this month.";
				const createdAt = new Date(
					zonedDateTimeToUtc(month.last, "18:00", ws.timezone),
				);
				const filters: ReportFilters = {
					workspaceIds: [ws.id],
					userIds: [user.id],
					dateRange: { from: month.first, to: month.last },
				};
				const context: ReportContextInput = {
					report: { name, note },
					period: { from: month.first, to: month.last, preset: null },
					timezone: ws.timezone,
					generatedAt: createdAt,
					workspaces: [
						{ id: ws.id, slug: ws.slug, name: ws.name, timezone: ws.timezone },
					],
					projects: scopedProjects.map((p) => ({
						id: p.id,
						slug: p.slug,
						name: p.name,
						workspaceId: ws.id,
					})),
					users: [{ id: user.id, name: user.name }],
					entries: entries.map(toEngineEntry),
				};
				const rendered = await renderReport(tmpl.body, context);
				const id = randomUUID();
				reportRows.push({
					id,
					name,
					ownerUserId: user.id,
					templateId: tmpl.id,
					filters,
					note,
					totalMinutes: entries.reduce((a, e) => a + e.minutes, 0),
					renderedMarkdown: rendered,
					createdAt,
					updatedAt: createdAt,
				});
				const manager = managerByWs.get(ws.key);
				addDeliveries(
					{ id, name, sender: user, rendered },
					manager && manager.key !== user.key ? [manager] : [],
					month.first,
					month.last,
					createdAt,
					true,
				);
				if (ws.client) {
					const token = generateShareToken();
					const r2Key = `shares/${token}`;
					const viewCount = (shareRows.length % 5) + 1;
					shareRows.push({
						id: randomUUID(),
						reportId: id,
						token,
						r2Key,
						reportName: name,
						dateFrom: month.first,
						dateTo: month.last,
						passcodeHash: null,
						expiresAt: null,
						revokedAt: null,
						viewCount,
						lastViewedAt: new Date(createdAt.getTime() + 86_400_000),
						createdAt,
					});
					r2.push({ key: r2Key, body: rendered });
				}
			}
		}
	}

	// --- Instance settings (singleton) -------------------------------------
	const overrides: Record<string, { enabled: boolean }> = {};
	for (const id of config.instance.disableBuiltinTemplates)
		overrides[id] = { enabled: false };
	const instanceRows: Row[] = [
		{
			id: "singleton",
			emailEnabled: config.instance.emailEnabled,
			emailFromAddress: null,
			emailFromName: null,
			googleOAuthEnabled: config.instance.googleOAuthEnabled,
			githubOAuthEnabled: config.instance.githubOAuthEnabled,
			googleAllowedDomains: [],
			reportTemplateOverrides: overrides,
			updatedAt: baseCreatedAt,
		},
	];

	const tables: SeededTable[] = [
		{ table: "user", rows: userRows },
		{ table: "account", rows: accountRows },
		{ table: "workspaces", rows: workspaceRows },
		{ table: "workspaceMembers", rows: memberRows },
		{ table: "projects", rows: projectRows },
		{ table: "workEntries", rows: entryRows },
		{ table: "reportTemplates", rows: templateRows },
		{ table: "instanceSettings", rows: instanceRows },
		{ table: "reports", rows: reportRows },
		{ table: "reportShares", rows: shareRows },
		{ table: "reportDeliveries", rows: deliveryRows },
	];

	return {
		tables,
		r2,
		credentials: config.users.map((u) => ({ name: u.name, email: u.email })),
		summary: Object.fromEntries(tables.map((t) => [t.table, t.rows.length])),
	};
}

export type { SeedConfig };
