import { randomUUID } from "node:crypto";
import {
	buildReportFrontMatter,
	generateShareToken,
	hashToken,
	lastDayOfMonth,
	type ReportContextInput,
	type ReportFilters,
	renderReport,
	shiftDays,
	todayInTimezone,
	type WorkEntrySource,
	zonedDateTimeToUtc,
} from "@spantail/core";
import { defaultTemplates } from "@spantail/templates/node";
import { hashPassword } from "better-auth/crypto";

import {
	type Cadence,
	type Language,
	loadConfig,
	type SeedConfig,
} from "./schema";

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
	credentials: Array<{ name: string; email: string; password: string }>;
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

/** Deterministic 32-bit FNV-1a hash; keeps per-day jitter reproducible. */
function hashString(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

// A distinct, deterministic sign-in password per user (salted by email, which is
// unique across datasets). Long and mixed-class so 1Password/Chrome don't flag it
// as reused or weak; printed by `db:seed` so a tester can copy the pair. Demo
// data only — these are local credentials, not secrets.
function passwordForEmail(email: string): string {
	const local = email.split("@")[0] ?? email;
	const label = local.charAt(0).toUpperCase() + local.slice(1);
	const suffix = hashString(`pw:${email}`)
		.toString(36)
		.padStart(7, "0")
		.slice(-6);
	return `Spantail-${label}-${suffix}`;
}

/** Rounds minutes to the nearest quarter hour, never below 15. */
function roundMinutes(n: number): number {
	return Math.max(15, Math.round(n / 15) * 15);
}

// Per-line daily multipliers (mean 1.0, so a line's baseline is its honest
// typical) with enough spread that daily totals rise and fall around ~8h
// instead of sitting flat.
const MINUTE_FACTORS = [0.75, 0.9, 1, 1, 1.1, 1.25];

// Weighted client channels for demo entries: mostly the web SPA, with enough
// cli/mcp/api mixed in that the source badge is meaningful in the demo.
const SOURCE_POOL: WorkEntrySource[] = [
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
export async function generateDataset(
	now: Date,
	dataDir: string,
	locale: Language,
): Promise<Dataset> {
	const config = loadConfig(dataDir);

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
			settings: {},
			createdAt: baseCreatedAt,
			archivedAt: null,
		});
	}

	// --- Users + credential accounts ---------------------------------------
	const usersByKey = new Map<string, ResolvedUser>();
	const userRows: Row[] = [];
	const accountRows: Row[] = [];
	const credentials: Array<{ name: string; email: string; password: string }> =
		[];
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
		const plainPassword = passwordForEmail(u.email);
		credentials.push({ name: u.name, email: u.email, password: plainPassword });
		accountRows.push({
			id: randomUUID(),
			accountId: id,
			providerId: "credential",
			userId: id,
			password: await hashPassword(plainPassword),
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

	// Timezone is per-user: give each demo user their primary (first-joined)
	// workspace's timezone, so their seeded work dates read coherently on the
	// home timeline. Users with no membership fall back to the UTC default (null).
	for (const [key, user] of usersByKey) {
		const home = workspacesByUser.get(key)?.[0];
		const row = userRows.find((r) => r.id === user.id);
		if (row) row.timezone = home?.timezone ?? null;
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
			symbol: p.symbol,
			status: "active",
			createdAt: baseCreatedAt,
			archivedAt: null,
		});
	}

	// --- Project members ----------------------------------------------------
	// Project access starts empty in production; the demo seeds every workspace
	// member into every project in their workspace so demo data is fully visible
	// and the seeded reports (scoped to each member's projects) still render.
	const projectMemberRows: Row[] = [];
	for (const proj of projByKey.values()) {
		for (const userKey of memberKeysByWs.get(proj.workspace.key) ?? []) {
			const user = usersByKey.get(userKey);
			if (!user) throw new Error("dangling project member reference");
			projectMemberRows.push({
				projectId: proj.id,
				userId: user.id,
				createdAt: baseCreatedAt,
			});
		}
	}

	// --- Templates (starter catalog: Daily, Weekly, Monthly) ---------------
	// The instance-scoped starter templates, seeded from @spantail/templates in
	// the dataset's `locale`. (In production a fresh instance lazily seeds the
	// same catalog in the first admin's locale.) Only Daily carries isDefault,
	// keeping the one-default invariant.
	const seedLocale = locale;
	const author =
		[...usersByKey.values()].find((u) => {
			const cfg = config.users.find((c) => c.key === u.key);
			return cfg?.canManageTemplates || cfg?.isAdmin;
		}) ?? [...usersByKey.values()][0];
	const templateRows: Row[] = [];
	const templatesByKey = new Map<string, { id: string; body: string }>();
	for (const t of defaultTemplates) {
		if (t.locale !== seedLocale) continue;
		const id = randomUUID();
		templateRows.push({
			id,
			name: t.name,
			description: t.description,
			body: t.body,
			enabled: true,
			isDefault: t.isDefault,
			nameTemplate: t.nameTemplate,
			noteTemplate: t.noteTemplate,
			defaultDateRange: t.defaultDateRange,
			createdBy: author?.id ?? null,
			createdAt: baseCreatedAt,
			updatedAt: baseCreatedAt,
		});
		templatesByKey.set(t.key, { id, body: t.body });
	}
	// Pick a seeded template by catalog key; each report renders through the one
	// whose type matches its period (daily reports → Daily, etc.).
	const templateFor = (key: "daily" | "weekly" | "monthly") => {
		const template = templatesByKey.get(key);
		if (!template)
			throw new Error(
				`no ${seedLocale} "${key}" template in @spantail/templates`,
			);
		return template;
	};

	// --- Work entries (last 45 days, weekdays, 8h/day) ---------------------
	// entry_date is the workspace-local date, so a member's work in a client
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

	const entryRows: Row[] = [];
	// user.key -> ws.key -> entries (drives both daily and monthly reports)
	const entriesByUserWs = new Map<string, Map<string, EntryRecord[]>>();

	for (const user of usersByKey.values()) {
		const allocation = config.workPatterns.allocations[user.key] ?? [];
		const byWs = new Map<string, EntryRecord[]>();
		entriesByUserWs.set(user.key, byWs);

		allocation.forEach((line) => {
			const project = projByKey.get(line.project);
			if (!project) throw new Error(`unknown project ${line.project}`);
			const { timezone, language } = project.workspace;
			const tagPool = config.workPatterns.tags[language];
			weekdaysFor(timezone).forEach((date) => {
				// A whole day off (~1 weekday in 18), taken consistently across the
				// member's projects so the day simply has no entries.
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
				// ~1 entry in 3 carries a second, distinct tag.
				if (hashString(`tag2:${seed}`) % 3 === 0) {
					const second = pick(tagPool, tagIndex + 1);
					if (second !== tags[0]) tags.push(second);
				}
				const record: EntryRecord = {
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
				entryRows.push({
					id: record.id,
					workspaceId: project.workspace.id,
					projectId: project.id,
					userId: user.id,
					entryDate: date,
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
	// One immutable content version per seeded report (all at version 1). Each
	// body carries the same system YAML front-matter header the API composes
	// (`buildReportFrontMatter` + body), so a seeded report is self-describing and
	// the reading pane's "Show header" has something to display.
	const contentRows: Row[] = [];
	// Composes a report version's stored content exactly as the API does: the
	// system provenance header (never template-controlled) followed by the body.
	// Seed reports are all version 1 with absolute (non-preset) periods.
	const contentWithHeader = (
		body: string,
		name: string,
		templateId: string,
		filters: ReportFilters,
		timezone: string,
		generatedAt: Date,
		totalMinutes: number,
	): string =>
		buildReportFrontMatter({
			name,
			version: 1,
			templateId,
			period: {
				from: filters.dateRange.from,
				to: filters.dateRange.to,
				preset: null,
			},
			filters: {
				workspaceIds: filters.workspaceIds,
				...(filters.projectIds?.length
					? { projectIds: filters.projectIds }
					: {}),
				...(filters.userIds?.length ? { userIds: filters.userIds } : {}),
				...(filters.tags?.length ? { tags: filters.tags } : {}),
			},
			totalMinutes,
			timezone,
			generatedAt: generatedAt.toISOString(),
		}) + body;
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
		report: { id: string; sender: ResolvedUser },
		recipients: ResolvedUser[],
		createdAt: Date,
		read: boolean,
	) => {
		if (recipients.length === 0) return;
		const batchId = randomUUID();
		for (const r of recipients) {
			deliveryRows.push({
				id: randomUUID(),
				// Seed reports are all version 1, so the delivered version is the
				// deterministic content id addReport minted.
				reportContentId: `${report.id}-v1`,
				senderUserId: report.sender.id,
				recipientUserId: r.id,
				batchId,
				senderName: report.sender.name,
				senderEmail: report.sender.email,
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
		const byWs =
			entriesByUserWs.get(user.key) ?? new Map<string, EntryRecord[]>();
		for (const ws of workspacesByUser.get(user.key) ?? []) {
			// Covered by a cross-workspace route → reported there, not here.
			if (routeWsByUser.get(user.key)?.has(ws.key)) continue;
			const tmpl = templateFor("daily");
			const manager = managerByWs.get(ws.key);
			const byDate = new Map<string, EntryRecord[]>();
			for (const entry of byWs.get(ws.key) ?? [])
				pushTo(byDate, entry.date, entry);

			for (const [date, entries] of [...byDate.entries()].sort(([a], [b]) =>
				a < b ? -1 : a > b ? 1 : 0,
			)) {
				const scopedProjects = [
					...new Map(entries.map((e) => [e.project.key, e.project])).values(),
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
					user: { name: user.name },
					period: { from: date, to: date, preset: null },
					timezone: ws.timezone,
					locale: ws.language,
					generatedAt: createdAt,
					workspaces: [{ id: ws.id, slug: ws.slug, name: ws.name }],
					projects: scopedProjects.map((p) => ({
						id: p.id,
						slug: p.slug,
						name: p.name,
						workspaceId: ws.id,
					})),
					users: [{ id: user.id, name: user.name }],
					entries: entries.map(toEngineEntry),
					// Seed reports are frozen snapshots; agent activity is exercised by
					// the live report-generation route, not these pre-rendered bodies.
					agents: [],
					agentEntries: [],
				};
				const rendered = await renderReport(tmpl.body, context);
				const totalMinutes = entries.reduce((a, e) => a + e.minutes, 0);
				const content = contentWithHeader(
					rendered,
					name,
					tmpl.id,
					filters,
					ws.timezone,
					createdAt,
					totalMinutes,
				);
				const id = randomUUID();
				addReport(
					{
						id,
						name,
						ownerUserId: user.id,
						templateId: tmpl.id,
						filters,
						note: null,
						totalMinutes,
						snapshotProjectIds: scopedProjects.map((p) => p.id),
						createdAt,
						updatedAt: createdAt,
					},
					content,
					createdAt,
				);
				addDeliveries(
					{ id, sender: user },
					manager && manager.key !== user.key ? [manager] : [],
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
		const tmpl = templateFor("daily");
		const recipients = [...usersByKey.values()].filter(
			(u) =>
				u.key !== sender.key &&
				route.workspaces.every((k) => memberKeysByWs.get(k)?.has(u.key)),
		);
		const byWs =
			entriesByUserWs.get(sender.key) ?? new Map<string, EntryRecord[]>();
		const byDate = new Map<string, EntryRecord[]>();
		for (const k of route.workspaces)
			for (const e of byWs.get(k) ?? []) pushTo(byDate, e.date, e);

		for (const [date, entries] of [...byDate.entries()].sort(([a], [b]) =>
			a < b ? -1 : a > b ? 1 : 0,
		)) {
			const scopedProjects = [
				...new Map(entries.map((e) => [e.project.key, e.project])).values(),
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
				user: { name: sender.name },
				period: { from: date, to: date, preset: null },
				timezone: anchor.timezone,
				locale: anchor.language,
				generatedAt: createdAt,
				workspaces: routeWs.map((w) => ({
					id: w.id,
					slug: w.slug,
					name: w.name,
				})),
				projects: scopedProjects.map((p) => ({
					id: p.id,
					slug: p.slug,
					name: p.name,
					workspaceId: p.workspace.id,
				})),
				users: [{ id: sender.id, name: sender.name }],
				entries: entries.map(toEngineEntry),
				// Seed reports are frozen snapshots; agent activity is exercised by
				// the live report-generation route, not these pre-rendered bodies.
				agents: [],
				agentEntries: [],
			};
			const rendered = await renderReport(tmpl.body, context);
			const totalMinutes = entries.reduce((a, e) => a + e.minutes, 0);
			const content = contentWithHeader(
				rendered,
				name,
				tmpl.id,
				filters,
				anchor.timezone,
				createdAt,
				totalMinutes,
			);
			const id = randomUUID();
			addReport(
				{
					id,
					name,
					ownerUserId: sender.id,
					templateId: tmpl.id,
					filters,
					note: null,
					totalMinutes,
					snapshotProjectIds: scopedProjects.map((p) => p.id),
					createdAt,
					updatedAt: createdAt,
				},
				content,
				createdAt,
			);
			addDeliveries({ id, sender }, recipients, createdAt, date <= readBefore);
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
		const byWs =
			entriesByUserWs.get(user.key) ?? new Map<string, EntryRecord[]>();
		for (const ws of workspacesByUser.get(user.key) ?? []) {
			const tmpl = templateFor("monthly");
			for (const month of completedMonthsFor(ws.timezone)) {
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
					user: { name: user.name },
					period: { from: month.first, to: month.last, preset: null },
					timezone: ws.timezone,
					locale: ws.language,
					generatedAt: createdAt,
					workspaces: [{ id: ws.id, slug: ws.slug, name: ws.name }],
					projects: scopedProjects.map((p) => ({
						id: p.id,
						slug: p.slug,
						name: p.name,
						workspaceId: ws.id,
					})),
					users: [{ id: user.id, name: user.name }],
					entries: entries.map(toEngineEntry),
					// Seed reports are frozen snapshots; agent activity is exercised by
					// the live report-generation route, not these pre-rendered bodies.
					agents: [],
					agentEntries: [],
				};
				const rendered = await renderReport(tmpl.body, context);
				const totalMinutes = entries.reduce((a, e) => a + e.minutes, 0);
				const content = contentWithHeader(
					rendered,
					name,
					tmpl.id,
					filters,
					ws.timezone,
					createdAt,
					totalMinutes,
				);
				const id = randomUUID();
				addReport(
					{
						id,
						name,
						ownerUserId: user.id,
						templateId: tmpl.id,
						filters,
						note,
						totalMinutes,
						snapshotProjectIds: scopedProjects.map((p) => p.id),
						createdAt,
						updatedAt: createdAt,
					},
					content,
					createdAt,
				);
				const manager = managerByWs.get(ws.key);
				addDeliveries(
					{ id, sender: user },
					manager && manager.key !== user.key ? [manager] : [],
					createdAt,
					true,
				);
				if (ws.client) {
					const token = generateShareToken();
					const viewCount = (shareRows.length % 5) + 1;
					shareRows.push({
						id: randomUUID(),
						// The share references the report's only (version 1) content row
						// minted by addReport; the owner is the one who published it.
						reportContentId: `${id}-v1`,
						createdByUserId: user.id,
						token,
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
			realtimeEnabled: config.instance.realtimeEnabled,
			updatedAt: baseCreatedAt,
		},
	];

	// --- Agents + per-turn telemetry ---------------------------------------
	// A couple of demo Claude Code agents, each with a few recent sessions. Each
	// session is a set of immutable per-turn `agent_events` plus the materialized
	// `agent_entries` rollup the ingest route would compute from them — derived
	// here in JS so the two stay coherent (entry.totalTokens == Σ event tokens,
	// duration == max−min). Tokens are placeholder hashes (no usable secret).
	const agentRows: Row[] = [];
	const agentTokenRows: Row[] = [];
	const agentEntryRows: Row[] = [];
	const agentEventRows: Row[] = [];
	// Provenance links from work entries to the agent sessions they were logged
	// from — the read surface the entry dialog's session summary consumes.
	const workEntryAgentEntryRows: Row[] = [];

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

		// Three sessions on every weekday in the window (workspace-local dates), so
		// each agent accrues a long history that overflows the agent-detail list
		// (PAGE_SIZE 50) even within a single-month period preset (~22 weekdays ×
		// 3 ≈ 66 > 50).
		const slots = ["09:30", "13:00", "16:30"];
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
				// Session summaries reuse the project's activity pool so they match
				// the demo's domain (and the dataset's language). Roughly a quarter
				// stay untitled so the no-description rendering stays visible.
				const description =
					project && hashString(`agdesc:${sessionId}`) % 4 !== 0
						? pick(project.activities, hashString(`agact:${sessionId}`))
						: null;
				const agentEntryId = randomUUID();
				// A demo GitHub identity per project so the session carries a repo, a
				// branch, and a PR ref (`github:owner/repo#N`) — the context facets the
				// agent dialog and the work-entry session summary surface. Opaque demo
				// values; the repo need not exist.
				const repoFullName = project ? `spantail-demo/${project.key}` : null;
				const context = repoFullName
					? {
							repositories: [`https://github.com/${repoFullName}`],
							branches: [
								`agent/${user.key}-${hashString(`br:${sessionId}`) % 100}`,
							],
							refs: [
								`github:${repoFullName}#${100 + (hashString(`pr:${sessionId}`) % 400)}`,
							],
							models: [AGENT_MODEL],
						}
					: { models: [AGENT_MODEL] };
				// Half the sessions report a dollar cost (as a cost-reporting source
				// like Cursor would), so the agent session detail dialog shows both the
				// cost and no-cost cases. (The work-entry summary intentionally omits
				// cost — see the entry dialog.)
				const costUsd =
					hashString(`cost:${sessionId}`) % 2 === 0
						? Number(((totalTokens / 1_000_000) * 3).toFixed(4))
						: undefined;
				agentEntryRows.push({
					id: agentEntryId,
					workspaceId: ws.id,
					ownerUserId: user.id,
					projectId: project?.id ?? null,
					agentId,
					sessionId,
					durationMinutes: Math.max(0, Math.round((maxTs - minTs) / 60_000)),
					usage: {
						inputTokens: input,
						outputTokens: output,
						cacheCreationTokens: cacheCreation,
						cacheReadTokens: cacheRead,
						totalTokens,
						model: AGENT_MODEL,
						...(costUsd !== undefined ? { costUsd } : {}),
					},
					context,
					// The rollup's event count = the session's turns, matching what the
					// events-fed ingest route would materialize (surfaced as
					// `eventCount` on the read model).
					rollupEventCount: turns,
					description,
					startedAt: new Date(minTs),
					endedAt: new Date(maxTs),
					createdAt: new Date(maxTs),
					updatedAt: new Date(maxTs),
				});
				// Link ~2/3 of sessions to one of the owner's work entries that day, so
				// some entries show a multi-session summary and others none — the
				// provenance a "log work from sessions" flow records.
				const dayEntries =
					entriesByUserWs
						.get(user.key)
						?.get(ws.key)
						?.filter((e) => e.date === date) ?? [];
				if (
					dayEntries.length > 0 &&
					hashString(`link:${sessionId}`) % 3 !== 0
				) {
					const target = pick(dayEntries, hashString(`linksel:${sessionId}`));
					workEntryAgentEntryRows.push({
						workEntryId: target.id,
						agentEntryId,
						createdAt: new Date(maxTs),
					});
				}
			}
		}
	}

	const tables: SeededTable[] = [
		{ table: "user", rows: userRows },
		{ table: "account", rows: accountRows },
		{ table: "workspaces", rows: workspaceRows },
		{ table: "workspaceMembers", rows: memberRows },
		{ table: "projects", rows: projectRows },
		{ table: "projectMembers", rows: projectMemberRows },
		{ table: "workEntries", rows: entryRows },
		{ table: "reportTemplates", rows: templateRows },
		{ table: "instanceSettings", rows: instanceRows },
		{ table: "reports", rows: reportRows },
		{ table: "reportContent", rows: contentRows },
		{ table: "reportShares", rows: shareRows },
		{ table: "reportDeliveries", rows: deliveryRows },
		{ table: "agents", rows: agentRows },
		{ table: "agentTokens", rows: agentTokenRows },
		{ table: "agentEntries", rows: agentEntryRows },
		{ table: "agentEvents", rows: agentEventRows },
		// After both parents (workEntries, agentEntries): the join's FKs are
		// enforced at insert time.
		{ table: "workEntryAgentEntries", rows: workEntryAgentEntryRows },
	];

	return {
		tables,
		credentials,
		summary: Object.fromEntries(tables.map((t) => [t.table, t.rows.length])),
	};
}

export type { SeedConfig };
