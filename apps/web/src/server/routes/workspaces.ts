import {
	createWorkspaceInputSchema,
	isWorkspaceLogoMimeType,
	updateWorkspaceInputSchema,
	WORKSPACE_LOGO_MAX_BYTES,
	WORKSPACE_LOGO_MIME_TYPES,
} from "@toxil/core";
import {
	createWorkspace,
	getWorkspaceBySlug,
	listWorkspacesForUser,
	updateWorkspace,
} from "@toxil/db";
import { Hono } from "hono";

import { readBodyWithLimit } from "../lib/avatar";
import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";
import { memberRoutes } from "./members";
import { workspaceProjectRoutes } from "./projects";

// Logos live in the shared uploads bucket under a per-workspace prefix.
const workspaceLogoKey = (workspaceId: string) =>
	`workspaces/${workspaceId}/logo`;

export const workspaceRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const { user } = requireScope(c, "read");
		return c.json(await listWorkspacesForUser(c.var.db, user.id));
	})
	.post("/", async (c) => {
		const { user } = requireScope(c, "admin");
		if (!user.isAdmin) {
			throw new AppError(
				"forbidden",
				"Only instance admins can create workspaces",
			);
		}
		const input = validate(createWorkspaceInputSchema, await c.req.json());
		if (await getWorkspaceBySlug(c.var.db, input.slug)) {
			throw new AppError(
				"conflict",
				"A workspace with this slug already exists",
			);
		}
		const workspace = await createWorkspace(c.var.db, {
			...input,
			ownerUserId: user.id,
		});
		return c.json(workspace, 201);
	})
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const { workspace } = await requireWorkspaceAccess(c, c.req.param("id"));
		return c.json(workspace);
	})
	.patch("/:id", async (c) => {
		requireScope(c, "admin");
		const workspaceId = c.req.param("id");
		await requireWorkspaceAccess(c, workspaceId, "admin");
		const input = validate(updateWorkspaceInputSchema, await c.req.json());
		const { archived, ...rest } = input;
		if (rest.slug !== undefined) {
			const existing = await getWorkspaceBySlug(c.var.db, rest.slug);
			if (existing && existing.id !== workspaceId) {
				throw new AppError(
					"conflict",
					"A workspace with this slug already exists",
				);
			}
		}
		const updated = await updateWorkspace(c.var.db, workspaceId, {
			...rest,
			...(archived === undefined
				? {}
				: { archivedAt: archived ? new Date() : null }),
		});
		return c.json(updated);
	})
	// Serves the logo through the Worker so the session cookie authorizes it
	// (the SPA loads it via <img>). "no-cache" forces the browser to revalidate
	// on every use, which re-runs requireWorkspaceAccess — so a revoked member's
	// cached copy stops being served. The ETag makes that revalidation a cheap
	// 304 when the bytes are unchanged.
	.get("/:id/logo", async (c) => {
		requireScope(c, "read");
		const workspaceId = c.req.param("id");
		await requireWorkspaceAccess(c, workspaceId);
		const object = await c.env.UPLOADS.get(workspaceLogoKey(workspaceId));
		if (!object) throw new AppError("not_found", "Workspace has no logo");
		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set("etag", object.httpEtag);
		headers.set("cache-control", "private, no-cache");
		headers.set("x-content-type-options", "nosniff");
		if (c.req.header("if-none-match") === object.httpEtag) {
			return new Response(null, { status: 304, headers });
		}
		return new Response(object.body, { headers });
	})
	.put("/:id/logo", async (c) => {
		requireScope(c, "admin");
		const workspaceId = c.req.param("id");
		await requireWorkspaceAccess(c, workspaceId, "admin");
		const contentType = c.req.header("content-type")?.split(";")[0]?.trim();
		if (!contentType || !isWorkspaceLogoMimeType(contentType)) {
			throw new AppError(
				"bad_request",
				`Logo must be one of: ${WORKSPACE_LOGO_MIME_TYPES.join(", ")}`,
			);
		}
		// Stream the body with a hard cap so an oversized upload — even a chunked
		// one with no Content-Length — never fully buffers into Worker memory.
		const body = await readBodyWithLimit(
			c.req.raw.body,
			WORKSPACE_LOGO_MAX_BYTES,
		);
		if (body === null) {
			throw new AppError(
				"bad_request",
				"Logo exceeds the maximum size of 1 MB",
			);
		}
		if (body.byteLength === 0) {
			throw new AppError("bad_request", "Logo file is empty");
		}
		await c.env.UPLOADS.put(workspaceLogoKey(workspaceId), body, {
			httpMetadata: { contentType },
		});
		const version = crypto.randomUUID().slice(0, 8);
		const updated = await updateWorkspace(c.var.db, workspaceId, {
			logoUrl: `/api/v1/workspaces/${workspaceId}/logo?v=${version}`,
		});
		return c.json(updated);
	})
	.delete("/:id/logo", async (c) => {
		requireScope(c, "admin");
		const workspaceId = c.req.param("id");
		await requireWorkspaceAccess(c, workspaceId, "admin");
		await c.env.UPLOADS.delete(workspaceLogoKey(workspaceId));
		const updated = await updateWorkspace(c.var.db, workspaceId, {
			logoUrl: null,
		});
		return c.json(updated);
	})
	.route("/:id/members", memberRoutes)
	.route("/:id/projects", workspaceProjectRoutes);
