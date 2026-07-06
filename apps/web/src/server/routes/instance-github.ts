import { githubManifestInitInputSchema } from "@spantail/core";
import {
	deleteGithubAppConfig,
	getGithubAppConfig,
	getGithubInstallation,
	listAllGithubRepoMappings,
	listGithubInstallations,
} from "@spantail/db";
import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { listInstallationRepos } from "../lib/github/api";
import {
	clearInstallationTokenCache,
	getInstallationToken,
} from "../lib/github/app-auth";
import { buildAppManifest, manifestFormAction } from "../lib/github/manifest";
import { requireInstanceAdmin } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";
import { setStateCookie } from "./github-connect";

/** Instance-admin management of the BYO GitHub App (issue #159). */
export const instanceGithubRoutes = new Hono<AppEnv>()
	// Whether an App is configured. Read by any signed-in user to gate the
	// Connect GitHub card; exposes only the boolean.
	.get("/enabled", async (c) => {
		requireAuth(c);
		const config = await getGithubAppConfig(c.var.db);
		return c.json({ enabled: config !== undefined });
	})
	.get("/", async (c) => {
		requireInstanceAdmin(c);
		const config = await getGithubAppConfig(c.var.db);
		const installations = config ? await listGithubInstallations(c.var.db) : [];
		return c.json({
			// Secrets never leave the server; this is display data only.
			app: config
				? {
						appId: config.appId,
						slug: config.slug,
						ownerLogin: config.ownerLogin,
						createdAt: config.createdAt.toISOString(),
					}
				: null,
			installations: installations.map((row) => ({
				installationId: row.installationId,
				accountLogin: row.accountLogin,
				accountType: row.accountType,
				suspended: row.suspendedAt !== null,
			})),
		});
	})
	// Starts the Manifest flow: returns the form target + manifest JSON the SPA
	// posts to GitHub, and binds the flow to this admin's browser via the state
	// cookie the /api/github/setup callback will demand.
	.post("/app/manifest", async (c) => {
		requireInstanceAdmin(c);
		const input = validate(githubManifestInitInputSchema, await c.req.json());
		const origin = new URL(c.req.url).origin;
		const state = await setStateCookie(c, c.env.BETTER_AUTH_SECRET, "manifest");
		const action = new URL(manifestFormAction(input.owner));
		action.searchParams.set("state", state);
		return c.json({
			action: action.toString(),
			manifest: JSON.stringify(buildAppManifest(origin)),
		});
	})
	.delete("/app", async (c) => {
		requireInstanceAdmin(c);
		await deleteGithubAppConfig(c.var.db);
		clearInstallationTokenCache();
		return c.body(null, 204);
	})
	// Live repo list for one installation, with mapping status — the admin's
	// picker for turning installed repos into project mappings. Not mirrored
	// into D1: GitHub is the source of truth for what an installation covers.
	.get("/installations/:installationId/repos", async (c) => {
		requireInstanceAdmin(c);
		const installationId = Number(c.req.param("installationId"));
		if (!Number.isSafeInteger(installationId)) {
			throw new AppError("bad_request", "Invalid installation id");
		}
		const config = await getGithubAppConfig(c.var.db);
		if (!config) throw new AppError("not_found", "No GitHub App configured");
		const installation = await getGithubInstallation(c.var.db, installationId);
		if (!installation) {
			throw new AppError("not_found", "Installation not found");
		}
		const token = await getInstallationToken(
			c.env.BETTER_AUTH_SECRET,
			config,
			installationId,
		);
		const [repos, mappings] = await Promise.all([
			listInstallationRepos(token),
			listAllGithubRepoMappings(c.var.db),
		]);
		const mapped = new Set(mappings.map((m) => m.repoFullName));
		return c.json({
			repos: repos.map((repo) => ({
				repoId: repo.id,
				fullName: repo.full_name,
				private: repo.private,
				mapped: mapped.has(repo.full_name.toLowerCase()),
			})),
		});
	});
