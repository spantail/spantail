import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { availableDatasets, repoRoot, seedDataDir } from "./exec";
import { loadConfig } from "./schema";

/**
 * `pnpm generate-import [name]` — the counterpart of `pnpm db:seed [name]`.
 *
 * Writes examples/<name>/import/work-entries.jsonl: three years of weekday
 * work entries spread across the members of the dataset's first workspace, in
 * the JSONL format `spantail entries import` consumes. Each line carries its
 * author's email in a `user` field, so the file exercises the instance-admin
 * cross-user import path (run it signed in as an instance admin). The output is
 * generated (and gitignored) rather than committed: it is derived data, and
 * dating it relative to the run keeps the demo fresh.
 *
 * The entries deliberately carry no externalId — they exercise the plain
 * insert path, so re-importing the file duplicates entries (as documented).
 */

const DEFAULT_DATASET = "demo";
const YEARS = 3;

/** Deterministic PRNG (mulberry32) so runs on the same day are identical. */
function mulberry32(seed: number): () => number {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function isoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function main(): void {
	const name = process.argv[2] ?? DEFAULT_DATASET;
	// Same dataset-name guard as db:seed: a single directory under examples/.
	if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
		throw new Error(
			`Invalid dataset name "${name}": use lowercase letters, digits and hyphens only.`,
		);
	}
	const dataDir = seedDataDir(name);
	if (!existsSync(dataDir)) {
		const choices = availableDatasets();
		const hint = choices.length
			? `Available datasets: ${choices.join(", ")}`
			: "No datasets found under examples/.";
		throw new Error(`Unknown dataset "${name}" (${dataDir}).\n${hint}`);
	}

	const config = loadConfig(dataDir);
	const workspace = config.workspaces[0];
	if (!workspace) throw new Error("dataset has no workspaces");
	const projects = config.projects.filter((p) => p.workspace === workspace.key);
	if (projects.length === 0) {
		throw new Error(`workspace ${workspace.key} has no projects`);
	}
	const emailByUserKey = new Map(config.users.map((u) => [u.key, u.email]));
	const memberEmails = config.members
		.filter((m) => m.workspace === workspace.key)
		.map((m) => {
			const email = emailByUserKey.get(m.user);
			if (!email) throw new Error(`member references unknown user ${m.user}`);
			return email;
		});
	if (memberEmails.length === 0) {
		throw new Error(`workspace ${workspace.key} has no members`);
	}
	const tags =
		config.workPatterns.tags[workspace.language] ?? config.workPatterns.tags.en;

	const random = mulberry32(0x5ea1);
	const pick = <T>(items: T[]): T => {
		const item = items[Math.floor(random() * items.length)];
		if (item === undefined) throw new Error("pick from empty list");
		return item;
	};

	// Weekdays (UTC calendar) over the last three years, oldest first.
	const lines: string[] = [];
	const today = new Date();
	const start = new Date(today);
	start.setUTCFullYear(start.getUTCFullYear() - YEARS);
	for (
		const day = new Date(start);
		day < today;
		day.setUTCDate(day.getUTCDate() + 1)
	) {
		const weekday = day.getUTCDay();
		if (weekday === 0 || weekday === 6) continue;

		const entriesToday = 2 + (random() < 0.5 ? 1 : 0);
		for (let i = 0; i < entriesToday; i++) {
			const project = pick(projects);
			const entry: Record<string, unknown> = {
				project: project.slug,
				user: pick(memberEmails),
				entryDate: isoDate(day),
				// 30 minutes to 4 hours, in quarter-hour units.
				durationMinutes: (2 + Math.floor(random() * 15)) * 15,
				description: pick(project.activities),
			};
			if (random() < 0.4) entry.tags = [pick(tags)];
			lines.push(JSON.stringify(entry));
		}
	}

	const outDir = join(repoRoot, "examples", name, "import");
	mkdirSync(outDir, { recursive: true });
	const outFile = join(outDir, "work-entries.jsonl");
	writeFileSync(outFile, `${lines.join("\n")}\n`, "utf8");

	console.log(
		`Wrote ${lines.length} entries (${YEARS} years of weekdays, ${memberEmails.length} authors, workspace "${workspace.slug}") to ${outFile}`,
	);
	console.log(
		`Import as an instance admin with: spantail entries import ${join("examples", name, "import/work-entries.jsonl")} --workspace ${workspace.slug}`,
	);
}

main();
