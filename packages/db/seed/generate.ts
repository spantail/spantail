import { randomUUID } from "node:crypto";
import {
	generateShareToken,
	getBuiltinTemplate,
	hashToken,
	lastDayOfMonth,
	type ReportContextInput,
	type ReportFilters,
	renderReport,
	shiftDays,
	todayInTimezone,
	type WorkSpanSource,
	zonedDateTimeToUtc,
} from "@spantail/core";
import { hashPassword } from "better-auth/crypto";

import {
	type Cadence,
	type Language,
	loadConfig,
	type SeedConfig,
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
	credentials: Array<{ name: string; email: string }>;
	summary: Record<string, number>;
}

interface ResolvedUser {
	id: string;
	key: string;
	name: string;
	email: string;
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
	activities: string[];
	workspace: ResolvedWorkspace;
}
interface SpanRecord {
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

/** Deterministic 32-bit FNV-1a hash; keeps per-day jitter reproducible. */
function hashString(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** Rounds minutes to the nearest quarter hour, never below 15. */
function roundMinutes(n: number): number {
	return Math.max(15, Math.round(n / 15) * 15);
}

// Per-line daily multipliers (mean 1.0, so a line's baseline is its honest
// typical) with enough spread that daily totals rise and fall around ~8h
// instead of sitting flat.
const MINUTE_FACTORS = [0.75, 0.9, 1, 1, 1.1, 1.25];

// Weighted client channels for demo spans: mostly the web SPA, with enough
// cli/mcp/api mixed in that the source badge is meaningful in the demo.
const SOURCE_POOL: WorkSpanSource[] = [
	"web",
	"web",
	"web",
	"web",
	"web",
	"web",
	"cli",
	"cli",
	"mcp",
	"api",
];

/** Whether a `cadence` line is worked on a given day (deterministic). */
function cadenceActive(
	cadence: Cadence,
	userKey: string,
	date: string,
	projectKey: string,
): boolean {
	if (cadence === "daily") return true;
	const h = hashString(`${cadence}:${userKey}:${date}:${projectKey}`);
	if (cadence === "often") return h % 3 !== 0; // most days
	if (cadence === "weekly") return h % 5 === 0; // ~once a week
	return h % 6 === 0; // occasional — a few days a month
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

function toEngineSpan(e: SpanRecord): ReportContextInput["spans"][number] {
	return {
		id: e.id,
		workspaceId: e.workspace.id,
		projectId: e.project.id,
		userId: e.user.id,
		spanDate: e.date,
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
		const id = randomUUID();
		const user: ResolvedUser = {
			id,
			key: u.key,
			name: u.name,
			email: u.email,
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
	// ws.key -> set of member user.keys, for resolving cross-workspace recipients.
	const memberKeysByWs = new Map<string, Set<string>>();
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
		const members = memberKeysByWs.get(ws.key) ?? new Set<string>();
		members.add(user.key);
		memberKeysByWs.set(ws.key, members);
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
			activities: p.activities,
			workspace: ws,
		};
		projByKey.set(p.key, proj);
		projectRows.push({
			id: proj.id,
			workspaceId: ws.id,
			slug: p.slug,
			name: p.name,
			description: p.description ?? null,
			hue: p.hue,
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

	// --- Work spans (last 45 days, weekdays, 8h/day) ---------------------
	// span_date is the workspace-local date, so a member's work in a client
	// workspace is dated in that workspace's timezone (not the member's home).
	const weekdaysByTz = new Map<string, string[]>();
	const weekdaysFor = (timezone: string): string[] => {
		const cached = weekdaysByTz.get(timezone);
		if (cached) return cached;
		const anchor = todayInTimezone(timezone, now);
		const dates: string[] = [];
		for (let back = WINDOW_DAYS - 1; back >= 0; back--) {
			const date = shiftDays(anchor, -back);
			if (isWeekday(date)) dates.push(date);
		}
		weekdaysByTz.set(timezone, dates);
		return dates;
	};

	const spanRows: Row[] = [];
	// user.key -> ws.key -> spans (drives both daily and monthly reports)
	const spansByUserWs = new Map<string, Map<string, SpanRecord[]>>();

	for (const user of usersByKey.values()) {
		const allocation = config.workPatterns.allocations[user.key] ?? [];
		const byWs = new Map<string, SpanRecord[]>();
		spansByUserWs.set(user.key, byWs);

		allocation.forEach((line) => {
			const project = projByKey.get(line.project);
			if (!project) throw new Error(`unknown project ${line.project}`);
			const { timezone, language } = project.workspace;
			const tagPool = config.workPatterns.tags[language];
			weekdaysFor(timezone).forEach((date) => {
				// A whole day off (~1 weekday in 18), taken consistently across the
				// member's projects so the day simply has no spans.
				if (hashString(`off:${user.key}:${date}`) % 18 === 0) return;
				// Non-daily lines (internal / help work) only land on some days.
				if (!cadenceActive(line.cadence, user.key, date, project.key)) return;
				const seed = `${user.key}:${date}:${project.key}`;
				const minutes = roundMinutes(
					line.minutes * pick(MINUTE_FACTORS, hashString(`min:${seed}`)),
				);
				const description = pick(project.activities, hashString(`act:${seed}`));
				const tagIndex = hashString(`tag:${seed}`);
				const tags = [pick(tagPool, tagIndex)];
				// ~1 span in 3 carries a second, distinct tag.
				if (hashString(`tag2:${seed}`) % 3 === 0) {
					const second = pick(tagPool, tagIndex + 1);
					if (second !== tags[0]) tags.push(second);
				}
				const record: SpanRecord = {
					id: randomUUID(),
					user,
					workspace: project.workspace,
					project,
					date,
					minutes,
					description,
					tags,
				};
				const createdAt = new Date(zonedDateTimeToUtc(date, "18:00", timezone));
				spanRows.push({
					id: record.id,
					workspaceId: project.workspace.id,
					projectId: project.id,
					userId: user.id,
					spanDate: date,
					durationMinutes: minutes,
					startedAt: null,
					endedAt: null,
					description,
					note: null,
					tags,
					source: pick(SOURCE_POOL, hashString(`src:${seed}`)),
					createdAt,
					updatedAt: createdAt,
				});
				pushTo(byWs, project.workspace.key, record);
			});
		});
	}

	// --- Reports / deliveries / shares -------------------------------------
	const reportRows: Row[] = [];
	// One immutable content version per seeded report (all at version 1). Seed
	// bodies carry no front-matter; that renders fine (display only strips a
	// header when present).
	const contentRows: Row[] = [];
	const addReport = (report: Row, rendered: string, createdAt: Date) => {
		reportRows.push({ ...report, version: 1 });
		contentRows.push({
			id: `${report.id as string}-v1`,
			reportId: report.id,
			version: 1,
			content: rendered,
			note: report.note ?? null,
			createdAt,
		});
	};
	const deliveryRows: Row[] = [];
	const shareRows: Row[] = [];
	const readBefore = shiftDays(todayInTimezone("UTC", now), -3);

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

	// Workspaces a member rolls up into a combined cross-workspace daily report
	// instead of a per-workspace one (see the route loop below).
	const routeWsByUser = new Map<string, Set<string>>();
	for (const route of config.reportRoutes) {
		const set = routeWsByUser.get(route.sender) ?? new Set<string>();
		for (const w of route.workspaces) set.add(w);
		routeWsByUser.set(route.sender, set);
	}

	// Daily, per workspace: one report per member per workspace per working day,
	// sent to that workspace's manager. Scoping to a single workspace keeps the
	// frozen body within what the recipient (a member) is allowed to see.
	for (const user of usersByKey.values()) {
		const byWs = spansByUserWs.get(user.key) ?? new Map<string, SpanRecord[]>();
		for (const ws of workspacesByUser.get(user.key) ?? []) {
			// Covered by a cross-workspace route → reported there, not here.
			if (routeWsByUser.get(user.key)?.has(ws.key)) continue;
			const tmpl = templateFor(ws.language, "day");
			const manager = managerByWs.get(ws.key);
			const byDate = new Map<string, SpanRecord[]>();
			for (const span of byWs.get(ws.key) ?? [])
				pushTo(byDate, span.date, span);

			for (const [date, spans] of [...byDate.entries()].sort(([a], [b]) =>
				a < b ? -1 : a > b ? 1 : 0,
			)) {
				const scopedProjects = [
					...new Map(spans.map((e) => [e.project.key, e.project])).values(),
				];
				const name =
					ws.language === "ja"
						? `日報 — ${ws.name} — ${date}`
						: `Daily report — ${ws.name} — ${date}`;
				const createdAt = new Date(
					zonedDateTimeToUtc(date, "18:30", ws.timezone),
				);
				const filters: ReportFilters = {
					workspaceIds: [ws.id],
					userIds: [user.id],
					dateRange: { from: date, to: date },
				};
				const context: ReportContextInput = {
					report: { name, note: null },
					period: { from: date, to: date, preset: null },
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
					spans: spans.map(toEngineSpan),
				};
				const rendered = await renderReport(tmpl.body, context);
				const id = randomUUID();
				addReport(
					{
						id,
						name,
						ownerUserId: user.id,
						templateId: tmpl.id,
						filters,
						note: null,
						totalMinutes: spans.reduce((a, e) => a + e.minutes, 0),
						createdAt,
						updatedAt: createdAt,
					},
					rendered,
					createdAt,
				);
				addDeliveries(
					{ id, name, sender: user, rendered },
					manager && manager.key !== user.key ? [manager] : [],
					date,
					date,
					createdAt,
					date <= readBefore,
				);
			}
		}
	}

	// Cross-workspace daily: a member who spans several workspaces files one
	// combined daily report covering them all. It may go only to people who are
	// members of every listed workspace, so the frozen body never exposes a
	// workspace the recipient isn't in (the same rule the app's "Send to"
	// enforces). The first workspace anchors the timezone and template language.
	for (const route of config.reportRoutes) {
		const sender = usersByKey.get(route.sender);
		if (!sender) throw new Error(`unknown route sender ${route.sender}`);
		const routeWs = route.workspaces.map((k) => {
			const ws = wsByKey.get(k);
			if (!ws) throw new Error(`unknown route workspace ${k}`);
			return ws;
		});
		const anchor = routeWs[0] as ResolvedWorkspace;
		const tmpl = templateFor(anchor.language, "day");
		const recipients = [...usersByKey.values()].filter(
			(u) =>
				u.key !== sender.key &&
				route.workspaces.every((k) => memberKeysByWs.get(k)?.has(u.key)),
		);
		const byWs =
			spansByUserWs.get(sender.key) ?? new Map<string, SpanRecord[]>();
		const byDate = new Map<string, SpanRecord[]>();
		for (const k of route.workspaces)
			for (const e of byWs.get(k) ?? []) pushTo(byDate, e.date, e);

		for (const [date, spans] of [...byDate.entries()].sort(([a], [b]) =>
			a < b ? -1 : a > b ? 1 : 0,
		)) {
			const scopedProjects = [
				...new Map(spans.map((e) => [e.project.key, e.project])).values(),
			];
			const label = routeWs.map((w) => w.name).join(" + ");
			const name =
				anchor.language === "ja"
					? `日報 — ${label} — ${date}`
					: `Daily report — ${label} — ${date}`;
			const createdAt = new Date(
				zonedDateTimeToUtc(date, "18:45", anchor.timezone),
			);
			const filters: ReportFilters = {
				workspaceIds: routeWs.map((w) => w.id),
				userIds: [sender.id],
				dateRange: { from: date, to: date },
			};
			const context: ReportContextInput = {
				report: { name, note: null },
				period: { from: date, to: date, preset: null },
				timezone: anchor.timezone,
				generatedAt: createdAt,
				workspaces: routeWs.map((w) => ({
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
				users: [{ id: sender.id, name: sender.name }],
				spans: spans.map(toEngineSpan),
			};
			const rendered = await renderReport(tmpl.body, context);
			const id = randomUUID();
			addReport(
				{
					id,
					name,
					ownerUserId: sender.id,
					templateId: tmpl.id,
					filters,
					note: null,
					totalMinutes: spans.reduce((a, e) => a + e.minutes, 0),
					createdAt,
					updatedAt: createdAt,
				},
				rendered,
				createdAt,
			);
			addDeliveries(
				{ id, name, sender, rendered },
				recipients,
				date,
				date,
				createdAt,
				date <= readBefore,
			);
		}
	}

	// Monthly, per workspace, for months that have completed within the window —
	// computed in each workspace's timezone so a month is neither dropped nor
	// created early near a local month boundary.
	const monthsByTz = new Map<
		string,
		Array<{ first: string; last: string; ym: string }>
	>();
	const completedMonthsFor = (timezone: string) => {
		const cached = monthsByTz.get(timezone);
		if (cached) return cached;
		const anchor = todayInTimezone(timezone, now);
		const windowStart = shiftDays(anchor, -(WINDOW_DAYS - 1));
		const [ay = 0, am = 1] = anchor.split("-").map(Number);
		const months: Array<{ first: string; last: string; ym: string }> = [];
		for (let offset = 1; offset <= 2; offset++) {
			const first = new Date(Date.UTC(ay, am - 1 - offset, 1));
			const firstStr = first.toISOString().slice(0, 10);
			const lastStr = lastDayOfMonth(
				first.getUTCFullYear(),
				first.getUTCMonth(),
			);
			if (lastStr <= anchor && lastStr >= windowStart) {
				months.push({
					first: firstStr,
					last: lastStr,
					ym: firstStr.slice(0, 7),
				});
			}
		}
		monthsByTz.set(timezone, months);
		return months;
	};

	for (const user of usersByKey.values()) {
		const byWs = spansByUserWs.get(user.key) ?? new Map<string, SpanRecord[]>();
		for (const ws of workspacesByUser.get(user.key) ?? []) {
			const tmpl = templateFor(ws.language, "month");
			for (const month of completedMonthsFor(ws.timezone)) {
				const spans = (byWs.get(ws.key) ?? []).filter(
					(e) => e.date >= month.first && e.date <= month.last,
				);
				if (spans.length === 0) continue;
				const scopedProjects = [
					...new Map(spans.map((e) => [e.project.key, e.project])).values(),
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
					spans: spans.map(toEngineSpan),
				};
				const rendered = await renderReport(tmpl.body, context);
				const id = randomUUID();
				addReport(
					{
						id,
						name,
						ownerUserId: user.id,
						templateId: tmpl.id,
						filters,
						note,
						totalMinutes: spans.reduce((a, e) => a + e.minutes, 0),
						createdAt,
						updatedAt: createdAt,
					},
					rendered,
					createdAt,
				);
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
					const viewCount = (shareRows.length % 5) + 1;
					shareRows.push({
						id: randomUUID(),
						reportId: id,
						token,
						renderedMarkdown: rendered,
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
			agentsEnabled: config.instance.agentsEnabled,
			reportTemplateOverrides: overrides,
			updatedAt: baseCreatedAt,
		},
	];

	// --- Agents + per-turn telemetry ---------------------------------------
	// A couple of demo Claude Code agents, each with a few recent sessions. Each
	// session is a set of immutable per-turn `agent_events` plus the materialized
	// `agent_spans` rollup the ingest route would compute from them — derived
	// here in JS so the two stay coherent (span.totalTokens == Σ event tokens,
	// duration == max−min). Tokens are placeholder hashes (no usable secret).
	const agentRows: Row[] = [];
	const agentTokenRows: Row[] = [];
	const agentSpanRows: Row[] = [];
	const agentEventRows: Row[] = [];

	const projectsByWs = new Map<string, ResolvedProject[]>();
	for (const p of projByKey.values()) pushTo(projectsByWs, p.workspace.key, p);

	const AGENT_MODEL = "claude-opus-4-8";
	const agentOwners = [...usersByKey.values()]
		.map((u) => ({
			user: u,
			workspaces: (workspacesByUser.get(u.key) ?? []).filter((w) => !w.client),
		}))
		.filter((o) => o.workspaces.length > 0)
		.slice(0, 2);

	for (const { user, workspaces } of agentOwners) {
		const ws = workspaces[0] as ResolvedWorkspace;
		const projects = projectsByWs.get(ws.key) ?? [];
		const agentId = randomUUID();
		agentRows.push({
			id: agentId,
			userId: user.id,
			type: "claude_code",
			// Agents are only ever shown to their owner, so the owner's name in the
			// label would be redundant.
			name: "My Claude Code",
			createdAt: baseCreatedAt,
			disabledAt: null,
			archivedAt: null,
		});
		agentTokenRows.push({
			id: randomUUID(),
			agentId,
			name: "Default",
			// Hash of a throwaway value: the token exists for display but no
			// plaintext is known, so nothing usable is committed.
			tokenHash: await hashToken(randomUUID()),
			defaultWorkspaceId: ws.id,
			lastUsedAt: null,
			expiresAt: null,
			createdAt: baseCreatedAt,
		});

		// Two sessions on every weekday in the window (workspace-local dates), so
		// each agent accrues a long, pageable history (50+ spans).
		const slots = ["10:00", "15:00"];
		for (const date of weekdaysFor(ws.timezone)) {
			for (const startHour of slots) {
				const project = projects.length
					? pick(
							projects,
							hashString(`agproj:${user.key}:${date}:${startHour}`),
						)
					: null;
				const sessionId = `seed-sess-${user.key}-${date}-${startHour}`;
				const startMs = new Date(
					zonedDateTimeToUtc(date, startHour, ws.timezone),
				).getTime();
				const turns = 3 + (hashString(`turns:${sessionId}`) % 5); // 3..7

				let minTs = Number.POSITIVE_INFINITY;
				let maxTs = Number.NEGATIVE_INFINITY;
				let input = 0;
				let output = 0;
				let cacheCreation = 0;
				let cacheRead = 0;
				for (let t = 0; t < turns; t++) {
					const tsMs =
						startMs +
						t * 90_000 +
						(hashString(`gap:${sessionId}:${t}`) % 30_000);
					const inTok = 80 + (hashString(`in:${sessionId}:${t}`) % 400);
					const outTok = 120 + (hashString(`out:${sessionId}:${t}`) % 600);
					const ccTok = hashString(`cc:${sessionId}:${t}`) % 1200;
					const crTok = 1000 + (hashString(`cr:${sessionId}:${t}`) % 160_000);
					input += inTok;
					output += outTok;
					cacheCreation += ccTok;
					cacheRead += crTok;
					minTs = Math.min(minTs, tsMs);
					maxTs = Math.max(maxTs, tsMs);
					agentEventRows.push({
						id: randomUUID(),
						agentId,
						workspaceId: ws.id,
						sessionId,
						sourceId: `seed-msg-${sessionId}-${t}`,
						timestamp: new Date(tsMs),
						model: AGENT_MODEL,
						usage: {
							input_tokens: inTok,
							output_tokens: outTok,
							cache_creation_input_tokens: ccTok,
							cache_read_input_tokens: crTok,
							service_tier: "standard",
						},
						createdAt: new Date(maxTs),
					});
				}

				const totalTokens = input + output + cacheCreation + cacheRead;
				agentSpanRows.push({
					id: randomUUID(),
					workspaceId: ws.id,
					ownerUserId: user.id,
					projectId: project?.id ?? null,
					agentId,
					sessionId,
					spanDate: todayInTimezone(ws.timezone, new Date(minTs)),
					durationMinutes: Math.max(0, Math.round((maxTs - minTs) / 60_000)),
					usage: {
						inputTokens: input,
						outputTokens: output,
						cacheCreationTokens: cacheCreation,
						cacheReadTokens: cacheRead,
						totalTokens,
						model: AGENT_MODEL,
					},
					description: null,
					startedAt: new Date(minTs),
					endedAt: new Date(maxTs),
					createdAt: new Date(maxTs),
					updatedAt: new Date(maxTs),
				});
			}
		}
	}

	const tables: SeededTable[] = [
		{ table: "user", rows: userRows },
		{ table: "account", rows: accountRows },
		{ table: "workspaces", rows: workspaceRows },
		{ table: "workspaceMembers", rows: memberRows },
		{ table: "projects", rows: projectRows },
		{ table: "workSpans", rows: spanRows },
		{ table: "reportTemplates", rows: templateRows },
		{ table: "instanceSettings", rows: instanceRows },
		{ table: "reports", rows: reportRows },
		{ table: "reportContent", rows: contentRows },
		{ table: "reportShares", rows: shareRows },
		{ table: "reportDeliveries", rows: deliveryRows },
		{ table: "agents", rows: agentRows },
		{ table: "agentTokens", rows: agentTokenRows },
		{ table: "agentSpans", rows: agentSpanRows },
		{ table: "agentEvents", rows: agentEventRows },
	];

	return {
		tables,
		credentials: config.users.map((u) => ({ name: u.name, email: u.email })),
		summary: Object.fromEntries(tables.map((t) => [t.table, t.rows.length])),
	};
}

export type { SeedConfig };
