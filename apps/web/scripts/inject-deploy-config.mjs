#!/usr/bin/env node
// Injects the per-instance D1 database_id into wrangler.jsonc at build time.
//
// Workers Builds (and any CI) checks out a fresh, ephemeral copy of the repo,
// so the placeholder database_id in wrangler.jsonc must be replaced with the
// self-hoster's real D1 id BEFORE `vite build` — the Cloudflare Vite plugin
// bakes a resolved wrangler config into dist/<worker>/wrangler.json, and
// `wrangler deploy` ships that snapshot, so an injection that ran after the
// build would never reach the deployed Worker. Hence the `build` script runs
// this first (before vite build), not the deploy step. The id is supplied as the
// `D1_DATABASE_ID` build variable — the ONLY per-instance value a fork needs,
// which is why nothing has to be committed to the fork (keeping "Sync fork"
// conflict-free). Everything else (Worker name, DB/bucket names, rate-limit
// namespace, DO bindings) is account-scoped and identical across forks.
//
// Three modes, all idempotent:
//   1. D1_DATABASE_ID unset            -> no-op (local dev / manual wrangler flow)
//   2. placeholder id present          -> replace it with D1_DATABASE_ID
//   3. a different real id already set  -> error (surface configuration drift)
//
// Zero dependencies: wrangler.jsonc is JSONC (comments), so JSON.parse would
// throw — we operate on the raw text with a literal replacement instead.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
// Defaults to apps/web/wrangler.jsonc; an explicit argv path lets the test
// point the script at a throwaway copy instead of mutating the real config.
const CONFIG_PATH =
	process.argv[2] ??
	join(dirname(fileURLToPath(import.meta.url)), "..", "wrangler.jsonc");

const databaseId = process.env.D1_DATABASE_ID?.trim();

if (!databaseId) {
	console.log(
		`[inject-deploy-config] D1_DATABASE_ID not set; leaving ${CONFIG_PATH} unchanged.`,
	);
	process.exit(0);
}

const source = readFileSync(CONFIG_PATH, "utf8");

// Matches a `"database_id": "<value>"` field, capturing (prefix, value, suffix).
// Both the drift check and the write scope to this pattern so the script only
// ever reads and mutates database_id values — never the placeholder string
// should it appear in a comment or some other field.
const databaseIdField = () => /("database_id"\s*:\s*")([^"]*)(")/g;

// Collect every configured database_id so drift is detected even if the file
// grows more than one D1 binding later.
const ids = [...source.matchAll(databaseIdField())].map((m) => m[2]);

if (ids.length === 0) {
	console.error(
		`[inject-deploy-config] No database_id field found in ${CONFIG_PATH}.`,
	);
	process.exit(1);
}

const drifted = ids.filter((id) => id !== PLACEHOLDER && id !== databaseId);
if (drifted.length > 0) {
	console.error(
		`[inject-deploy-config] ${CONFIG_PATH} already pins database_id ${drifted.join(
			", ",
		)}, which differs from D1_DATABASE_ID (${databaseId}).\n` +
			"Refusing to overwrite a committed id. Reset it to the placeholder " +
			`(${PLACEHOLDER}) or align D1_DATABASE_ID with the committed value.`,
	);
	process.exit(1);
}

if (!ids.includes(PLACEHOLDER)) {
	console.log(
		`[inject-deploy-config] database_id already set to ${databaseId}; nothing to do.`,
	);
	process.exit(0);
}

const updated = source.replace(databaseIdField(), (full, pre, value, post) =>
	value === PLACEHOLDER ? `${pre}${databaseId}${post}` : full,
);
writeFileSync(CONFIG_PATH, updated, "utf8");
console.log(
	`[inject-deploy-config] Injected D1_DATABASE_ID (${databaseId}) into ${CONFIG_PATH}.`,
);
