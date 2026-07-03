import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	projectSymbolSchema,
	slugSchema,
	tagSchema,
	timezoneSchema,
	workspaceRoleSchema,
} from "@spantail/core";
import { parse } from "yaml";
import { z } from "zod";

/** Content language of a workspace / template. */
export const languageSchema = z.enum(["en", "ja"]);
export type Language = z.infer<typeof languageSchema>;

const userConfigSchema = z.object({
	key: z.string().min(1),
	name: z.string().min(1).max(100),
	email: z.email(),
	isAdmin: z.boolean().default(false),
	canManageTemplates: z.boolean().default(false),
});

const workspaceConfigSchema = z.object({
	key: z.string().min(1),
	slug: slugSchema,
	name: z.string().min(1).max(100),
	timezone: timezoneSchema,
	language: languageSchema,
	// Client workspaces get their monthly reports published as share links.
	client: z.boolean().default(false),
});

const memberConfigSchema = z.object({
	workspace: z.string().min(1),
	user: z.string().min(1),
	role: workspaceRoleSchema,
});

const projectConfigSchema = z.object({
	key: z.string().min(1),
	workspace: z.string().min(1),
	slug: slugSchema,
	name: z.string().min(1).max(100),
	description: z.string().max(1000).optional(),
	// Color marker as an OKLCH hue (0–359).
	hue: z.number().int().min(0).max(359),
	// Shape marker paired with the hue. Defaults to "circle" when omitted.
	symbol: projectSymbolSchema.default("circle"),
	// Concrete task phrases the generator draws from; authored in the workspace language.
	activities: z.array(z.string().min(1).max(200)).min(1),
});

// How often a member works a project: `daily` every working day, the rest on a
// deterministic subset (often ≈ most days, weekly ≈ once a week, occasional ≈ a
// few days a month) so a week is mostly the main engagement with lighter
// internal and cross-client help mixed in.
export const cadenceSchema = z
	.enum(["daily", "often", "weekly", "occasional"])
	.default("daily");
export type Cadence = z.infer<typeof cadenceSchema>;

const allocationLineSchema = z.object({
	project: z.string().min(1),
	minutes: z.number().int().positive(),
	cadence: cadenceSchema,
});

const workPatternsConfigSchema = z.object({
	allocations: z.record(z.string(), z.array(allocationLineSchema).min(1)),
	tags: z.object({
		en: z.array(tagSchema).min(1),
		ja: z.array(tagSchema).min(1),
	}),
});

// A combined cross-workspace daily report: one sender, the workspaces it spans
// (first is the anchor). Recipients are derived from membership, not declared.
const reportRouteSchema = z.object({
	sender: z.string().min(1),
	workspaces: z
		.array(z.string().min(1))
		.min(2)
		.refine(
			(ws) => new Set(ws).size === ws.length,
			"a route's workspaces must be distinct",
		),
});

const instanceConfigSchema = z.object({
	emailEnabled: z.boolean().default(false),
	googleOAuthEnabled: z.boolean().default(false),
	githubOAuthEnabled: z.boolean().default(false),
	agentsEnabled: z.boolean().default(false),
});

export type UserConfig = z.infer<typeof userConfigSchema>;
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
export type MemberConfig = z.infer<typeof memberConfigSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type WorkPatternsConfig = z.infer<typeof workPatternsConfigSchema>;
export type ReportRouteConfig = z.infer<typeof reportRouteSchema>;
export type InstanceConfig = z.infer<typeof instanceConfigSchema>;

export interface SeedConfig {
	users: UserConfig[];
	workspaces: WorkspaceConfig[];
	members: MemberConfig[];
	projects: ProjectConfig[];
	workPatterns: WorkPatternsConfig;
	reportRoutes: ReportRouteConfig[];
	instance: InstanceConfig;
}

function read<T>(dataDir: string, file: string, schema: z.ZodType<T>): T {
	const path = join(dataDir, file);
	const raw = parse(readFileSync(path, "utf8"));
	const result = schema.safeParse(raw);
	if (!result.success) {
		throw new Error(
			`Invalid seed data in ${path}:\n${z.prettifyError(result.error)}`,
		);
	}
	return result.data;
}

/**
 * Loads and validates every YAML data file from `dataDir`, then checks
 * cross-references. The generation logic lives here in code; `dataDir` selects
 * which dataset (e.g. examples/demo/db/seed) supplies the data.
 */
export function loadConfig(dataDir: string): SeedConfig {
	const config: SeedConfig = {
		users: read(dataDir, "users.yaml", z.array(userConfigSchema).min(1)),
		workspaces: read(
			dataDir,
			"workspaces.yaml",
			z.array(workspaceConfigSchema).min(1),
		),
		members: read(dataDir, "members.yaml", z.array(memberConfigSchema).min(1)),
		projects: read(
			dataDir,
			"projects.yaml",
			z.array(projectConfigSchema).min(1),
		),
		workPatterns: read(dataDir, "work-patterns.yaml", workPatternsConfigSchema),
		reportRoutes: read(
			dataDir,
			"report-routes.yaml",
			z.array(reportRouteSchema),
		),
		instance: read(dataDir, "instance.yaml", instanceConfigSchema),
	};
	validateReferences(config);
	return config;
}

function validateReferences(config: SeedConfig): void {
	const userKeys = new Set(config.users.map((u) => u.key));
	const wsKeys = new Set(config.workspaces.map((w) => w.key));
	const projectKeys = new Set(config.projects.map((p) => p.key));

	const fail = (msg: string): never => {
		throw new Error(`Invalid seed data: ${msg}`);
	};

	for (const p of config.projects) {
		if (!wsKeys.has(p.workspace))
			fail(`project ${p.key} workspace ${p.workspace} is unknown`);
	}
	for (const m of config.members) {
		if (!wsKeys.has(m.workspace))
			fail(`member references unknown workspace ${m.workspace}`);
		if (!userKeys.has(m.user)) fail(`member references unknown user ${m.user}`);
	}
	for (const [userKey, lines] of Object.entries(
		config.workPatterns.allocations,
	)) {
		if (!userKeys.has(userKey))
			fail(`allocation references unknown user ${userKey}`);
		for (const line of lines) {
			if (!projectKeys.has(line.project))
				fail(
					`allocation for ${userKey} references unknown project ${line.project}`,
				);
		}
	}

	// Members per workspace, used to check both sender membership and that a
	// cross-workspace route resolves to at least one valid recipient.
	const membersByWs = new Map<string, Set<string>>();
	for (const m of config.members) {
		const set = membersByWs.get(m.workspace) ?? new Set<string>();
		set.add(m.user);
		membersByWs.set(m.workspace, set);
	}
	// One combined cross-workspace report per sender: duplicate senders would
	// skip per-workspace dailies for the union and emit overlapping reports.
	const routeSenders = new Set<string>();
	for (const route of config.reportRoutes) {
		if (routeSenders.has(route.sender))
			fail(`report route sender ${route.sender} appears more than once`);
		routeSenders.add(route.sender);
		if (!userKeys.has(route.sender))
			fail(`report route references unknown sender ${route.sender}`);
		for (const w of route.workspaces) {
			if (!wsKeys.has(w))
				fail(`report route references unknown workspace ${w}`);
			if (!membersByWs.get(w)?.has(route.sender))
				fail(`report route sender ${route.sender} is not a member of ${w}`);
		}
		// Mirror the app rule: a recipient must belong to every listed workspace.
		const eligible = [...userKeys].filter(
			(u) =>
				u !== route.sender &&
				route.workspaces.every((w) => membersByWs.get(w)?.has(u)),
		);
		if (eligible.length === 0)
			fail(
				`report route for ${route.sender} has no recipient in all of ${route.workspaces.join(", ")}`,
			);
	}
}
