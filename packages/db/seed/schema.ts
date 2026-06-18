import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import {
	periodUnitSchema,
	slugSchema,
	tagSchema,
	timezoneSchema,
	workspaceRoleSchema,
} from "@toxil/core";
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
});

const templateConfigSchema = z
	.object({
		key: z.string().min(1),
		name: z.string().min(1).max(100),
		description: z.string().max(1000).optional(),
		language: languageSchema,
		periodUnit: periodUnitSchema,
		// Exactly one of these must be set.
		body: z.string().min(1).max(50000).optional(),
		bodyFrom: z.string().min(1).optional(),
	})
	.refine(
		(t) => Boolean(t.body) !== Boolean(t.bodyFrom),
		"a template needs exactly one of `body` or `bodyFrom`",
	);

const allocationLineSchema = z.object({
	project: z.string().min(1),
	minutes: z.number().int().positive(),
});

const workPatternsConfigSchema = z.object({
	allocations: z.record(z.string(), z.array(allocationLineSchema).min(1)),
	descriptions: z.object({
		en: z.array(z.string().min(1)).min(1),
		ja: z.array(z.string().min(1)).min(1),
	}),
	tags: z.object({
		en: z.array(tagSchema).min(1),
		ja: z.array(tagSchema).min(1),
	}),
});

const instanceConfigSchema = z.object({
	emailEnabled: z.boolean().default(false),
	googleOAuthEnabled: z.boolean().default(false),
	githubOAuthEnabled: z.boolean().default(false),
	disableBuiltinTemplates: z.array(z.string().min(1)).default([]),
});

export type UserConfig = z.infer<typeof userConfigSchema>;
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
export type MemberConfig = z.infer<typeof memberConfigSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type TemplateConfig = z.infer<typeof templateConfigSchema>;
export type WorkPatternsConfig = z.infer<typeof workPatternsConfigSchema>;
export type InstanceConfig = z.infer<typeof instanceConfigSchema>;

export interface SeedConfig {
	users: UserConfig[];
	workspaces: WorkspaceConfig[];
	members: MemberConfig[];
	projects: ProjectConfig[];
	templates: TemplateConfig[];
	workPatterns: WorkPatternsConfig;
	instance: InstanceConfig;
}

const DATA_DIR = fileURLToPath(new URL("./data/", import.meta.url));

function read<T>(file: string, schema: z.ZodType<T>): T {
	const raw = parse(readFileSync(`${DATA_DIR}${file}`, "utf8"));
	const result = schema.safeParse(raw);
	if (!result.success) {
		throw new Error(
			`Invalid seed data in ${file}:\n${z.prettifyError(result.error)}`,
		);
	}
	return result.data;
}

/** Loads and validates every YAML data file, then checks cross-references. */
export function loadConfig(): SeedConfig {
	const config: SeedConfig = {
		users: read("users.yaml", z.array(userConfigSchema).min(1)),
		workspaces: read("workspaces.yaml", z.array(workspaceConfigSchema).min(1)),
		members: read("members.yaml", z.array(memberConfigSchema).min(1)),
		projects: read("projects.yaml", z.array(projectConfigSchema).min(1)),
		templates: read("templates.yaml", z.array(templateConfigSchema).min(1)),
		workPatterns: read("work-patterns.yaml", workPatternsConfigSchema),
		instance: read("instance.yaml", instanceConfigSchema),
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
}
