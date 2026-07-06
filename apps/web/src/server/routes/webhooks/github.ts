import {
	deleteGithubInstallation,
	getGithubAppConfig,
	setGithubInstallationSuspended,
	upsertGithubInstallation,
} from "@spantail/db";
import { Hono } from "hono";

import { handleIssueCommentCreated } from "../../lib/github/comment-pipeline";
import { decryptSecret } from "../../lib/github/crypto";
import { verifyWebhookSignature } from "../../lib/github/webhook";
import type { AppEnv } from "../../types";

/**
 * The App's webhook receiver. Everything GitHub sends is untrusted until the
 * HMAC over the raw body verifies against the stored webhook secret; the body
 * is read as bytes BEFORE any JSON parsing so the signature covers exactly
 * what GitHub signed. Responses are always fast 2xx after verification —
 * user-visible feedback goes through issue comments, never HTTP errors.
 */

interface InstallationPayload {
	action?: string;
	installation?: {
		id: number;
		account?: { login?: string; type?: string };
	};
}

export const githubWebhookRoutes = new Hono<AppEnv>().post("/", async (c) => {
	const config = await getGithubAppConfig(c.var.db);
	if (!config) {
		return c.json(
			{ error: { code: "not_found", message: "No GitHub App configured" } },
			404,
		);
	}
	const body = await c.req.arrayBuffer();
	const secret = await decryptSecret(
		c.env.BETTER_AUTH_SECRET,
		config.webhookSecretEnc,
	);
	const valid = await verifyWebhookSignature(
		secret,
		body,
		c.req.header("x-hub-signature-256"),
	);
	if (!valid) {
		return c.json(
			{ error: { code: "unauthorized", message: "Invalid signature" } },
			401,
		);
	}

	const event = c.req.header("x-github-event");
	const payload = JSON.parse(new TextDecoder().decode(body));

	if (event === "installation") {
		const p = payload as InstallationPayload;
		const installation = p.installation;
		if (!installation) return c.body(null, 204);
		switch (p.action) {
			case "created":
			case "unsuspend":
				await upsertGithubInstallation(c.var.db, {
					installationId: installation.id,
					accountLogin: installation.account?.login ?? "",
					accountType:
						installation.account?.type === "User" ? "User" : "Organization",
				});
				break;
			case "deleted":
				// Mappings survive on purpose: degraded mode keeps UC2 working.
				await deleteGithubInstallation(c.var.db, installation.id);
				break;
			case "suspend":
				await setGithubInstallationSuspended(
					c.var.db,
					installation.id,
					new Date(),
				);
				break;
		}
		return c.body(null, 204);
	}

	if (event === "issue_comment") {
		// The pipeline makes up to three sequential GitHub API calls; answer
		// GitHub inside its 10s delivery window and do the work after. Apps get
		// no automatic redelivery, so the early 2xx loses nothing, and the
		// comment-id idempotency guard makes manual redelivery safe.
		c.executionCtx.waitUntil(
			handleIssueCommentCreated({
				env: c.env,
				db: c.var.db,
				origin: new URL(c.req.url).origin,
				config,
				payload,
			}),
		);
		return c.body(null, 202);
	}

	// issues / pull_request / pull_request_review are subscribed for future
	// use (AgentEntry linking enrichment); accepted and ignored in v1.
	return c.body(null, 204);
});
