import {
	deleteGithubInstallation,
	getGithubAppConfig,
	setGithubInstallationSuspended,
	upsertGithubInstallation,
} from "@spantail/db";
import { Hono } from "hono";

import {
	handleIssueCommentCreated,
	type IssueCommentPayload,
} from "../../lib/github/comment-pipeline";
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

/** Upper bound for a buffered webhook body (real payloads are ≤ ~1 MB). */
const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;

export const githubWebhookRoutes = new Hono<AppEnv>().post("/", async (c) => {
	const config = await getGithubAppConfig(c.var.db);
	if (!config) {
		return c.json(
			{ error: { code: "not_found", message: "No GitHub App configured" } },
			404,
		);
	}
	// Reject shapeless requests before buffering the body: real GitHub
	// deliveries always carry a sha256 signature header.
	const signature = c.req.header("x-hub-signature-256");
	if (!signature?.startsWith("sha256=")) {
		return c.json(
			{ error: { code: "unauthorized", message: "Invalid signature" } },
			401,
		);
	}
	// And a Content-Length within reason: a fake header on a huge body must
	// not make the worker buffer it just to fail HMAC. GitHub always sends
	// Content-Length, and real event payloads are far below this bound.
	const contentLength = Number(c.req.header("content-length") ?? "");
	if (!Number.isFinite(contentLength) || contentLength > MAX_WEBHOOK_BYTES) {
		return c.json(
			{ error: { code: "bad_request", message: "Payload too large" } },
			413,
		);
	}
	const body = await c.req.arrayBuffer();
	const secret = await decryptSecret(
		c.env.BETTER_AUTH_SECRET,
		config.webhookSecretEnc,
	);
	const valid = await verifyWebhookSignature(secret, body, signature);
	if (!valid) {
		return c.json(
			{ error: { code: "unauthorized", message: "Invalid signature" } },
			401,
		);
	}

	const event = c.req.header("x-github-event");
	// Even a correctly signed body is untrusted input: malformed JSON must
	// answer 400, not throw into a 5xx (which would trigger redelivery noise).
	let payload: unknown;
	try {
		payload = JSON.parse(new TextDecoder().decode(body));
	} catch {
		return c.json(
			{ error: { code: "bad_request", message: "Malformed JSON payload" } },
			400,
		);
	}

	if (event === "installation") {
		const p = payload as InstallationPayload;
		const installation = p.installation;
		if (!installation) return c.body(null, 204);
		const accountLogin = installation.account?.login;
		const accountType = installation.account?.type;
		switch (p.action) {
			case "created":
			case "unsuspend":
				// A payload without a usable account identity would only create an
				// ambiguous row; skip it rather than storing an empty login.
				if (
					!accountLogin ||
					(accountType !== "User" && accountType !== "Organization")
				) {
					break;
				}
				await upsertGithubInstallation(c.var.db, {
					installationId: installation.id,
					accountLogin,
					accountType,
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
				// The pipeline reads every field defensively (optional types).
				payload: payload as IssueCommentPayload,
			}),
		);
		return c.body(null, 202);
	}

	// issues / pull_request / pull_request_review are subscribed for future
	// use (AgentEntry linking enrichment); accepted and ignored in v1.
	return c.body(null, 204);
});
