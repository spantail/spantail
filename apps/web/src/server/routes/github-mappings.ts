import { createGithubMappingInputSchema } from "@spantail/core";
import {
	createGithubRepoMapping,
	deleteGithubRepoMapping,
	getGithubAppConfig,
	getGithubRepoMapping,
	getGithubRepoMappingByFullName,
	getProjectById,
	listAllGithubRepoMappings,
	listGithubInstallations,
	listGithubRepoMappingsByWorkspace,
} from "@spantail/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { listInstallationRepos } from "../lib/github/api";
import { getInstallationToken } from "../lib/github/app-auth";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

/**
 * repo → project mappings, managed by workspace admins under their own
 * workspace (mounted at /workspaces/:id/github-mappings). The mapping is the
 * server-side single source of truth for UC1/UC2 project resolution; repo
 * full names are unique instance-wide, so a repo claimed by another
 * workspace conflicts with 409.
 */
export const githubMappingRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId);
		const mappings = await listGithubRepoMappingsByWorkspace(
			c.var.db,
			workspaceId,
		);
		const projectNames = new Map<string, string>();
		for (const mapping of mappings) {
			if (!projectNames.has(mapping.projectId)) {
				const project = await getProjectById(c.var.db, mapping.projectId);
				projectNames.set(mapping.projectId, project?.name ?? "");
			}
		}
		return c.json(
			mappings.map((mapping) => ({
				id: mapping.id,
				repoFullName: mapping.repoFullName,
				projectId: mapping.projectId,
				projectName: projectNames.get(mapping.projectId) ?? "",
				source: mapping.source,
				createdAt: mapping.createdAt.toISOString(),
			})),
		);
	})
	.post("/", async (c) => {
		const workspaceId = c.req.param("id") ?? "";
		// PAT callers need the admin scope, like other workspace-admin writes.
		requireScope(c, "admin");
		await requireWorkspaceAccess(c, workspaceId, "admin");
		const input = validate(createGithubMappingInputSchema, await c.req.json());

		const project = await getProjectById(c.var.db, input.projectId);
		if (!project || project.workspaceId !== workspaceId) {
			throw new AppError(
				"bad_request",
				"Project does not belong to this workspace",
			);
		}
		const fullName = input.repoFullName.toLowerCase();
		if (await getGithubRepoMappingByFullName(c.var.db, fullName)) {
			throw new AppError(
				"conflict",
				"This repository is already mapped to a project",
			);
		}
		// One create endpoint serves manual entry AND the unmapped-repos picker.
		// When an installation covers the repo, resolve its identity server-side
		// (never client-supplied): the repo id enables rename self-healing and
		// the installation id keeps enrichment/PR-linking on the right
		// installation in multi-installation instances. Best-effort — a GitHub
		// failure just records a manual mapping.
		let resolved: { repoId: number; installationId: number } | null = null;
		const config = await getGithubAppConfig(c.var.db);
		if (config) {
			for (const installation of await listGithubInstallations(c.var.db)) {
				if (installation.suspendedAt) continue;
				try {
					const token = await getInstallationToken(
						c.env.BETTER_AUTH_SECRET,
						config,
						installation.installationId,
					);
					const repo = (await listInstallationRepos(token)).find(
						(candidate) => candidate.full_name.toLowerCase() === fullName,
					);
					if (repo) {
						resolved = {
							repoId: repo.id,
							installationId: installation.installationId,
						};
						break;
					}
				} catch (error) {
					console.error("github mapping installation lookup failed", error);
				}
			}
		}
		const mapping = await createGithubRepoMapping(c.var.db, {
			repoFullName: fullName,
			repoId: resolved?.repoId ?? null,
			projectId: project.id,
			workspaceId,
			source: resolved ? "installation" : "manual",
			installationId: resolved?.installationId ?? null,
		});
		return c.json(
			{
				id: mapping.id,
				repoFullName: mapping.repoFullName,
				projectId: mapping.projectId,
				projectName: project.name,
				source: mapping.source,
				createdAt: mapping.createdAt.toISOString(),
			},
			201,
		);
	})
	.delete("/:mappingId", async (c) => {
		const workspaceId = c.req.param("id") ?? "";
		requireScope(c, "admin");
		await requireWorkspaceAccess(c, workspaceId, "admin");
		const mapping = await getGithubRepoMapping(
			c.var.db,
			c.req.param("mappingId") ?? "",
		);
		if (!mapping || mapping.workspaceId !== workspaceId) {
			throw new AppError("not_found", "Mapping not found");
		}
		await deleteGithubRepoMapping(c.var.db, mapping.id);
		return c.body(null, 204);
	})
	// Repos the App's installations cover that no one has mapped yet — the
	// workspace admin's picker. Read live from GitHub; empty without an App.
	.get("/unmapped-repos", async (c) => {
		const workspaceId = c.req.param("id") ?? "";
		requireScope(c, "admin");
		await requireWorkspaceAccess(c, workspaceId, "admin");
		const config = await getGithubAppConfig(c.var.db);
		if (!config) return c.json({ repos: [] });

		const installations = await listGithubInstallations(c.var.db);
		const mapped = new Set(
			(await listAllGithubRepoMappings(c.var.db)).map((m) => m.repoFullName),
		);
		const repos: { repoId: number; fullName: string; private: boolean }[] = [];
		for (const installation of installations) {
			if (installation.suspendedAt) continue;
			try {
				const token = await getInstallationToken(
					c.env.BETTER_AUTH_SECRET,
					config,
					installation.installationId,
				);
				for (const repo of await listInstallationRepos(token)) {
					if (!mapped.has(repo.full_name.toLowerCase())) {
						repos.push({
							repoId: repo.id,
							fullName: repo.full_name,
							private: repo.private,
						});
					}
				}
			} catch (error) {
				// A dead installation must not blank the whole picker.
				console.error("github unmapped-repos listing failed", error);
			}
		}
		return c.json({ repos });
	});
