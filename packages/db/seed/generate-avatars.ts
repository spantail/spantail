import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";

import { DEFAULT_DATASET, resolveSeedDataDir } from "./dataset";
import { seedR2Dir } from "./exec";
import { deterministicId } from "./ids";
import { loadConfig } from "./schema";

// Regenerates a dataset's committed R2 assets: an illustrated avatar per user
// and a monogram logo per workspace, as 256px WebP under examples/<name>/r2/,
// keyed by the deterministic ids the seed derives (so their presence wires the
// avatar/logo into the DB seed). These are placeholder artwork, license-free and
// distinct from the app's initials fallback; swap the files for real photos
// without any code change. Run: `pnpm generate-avatars [name]`.

const SIZE = 256;

/** Deterministic 32-bit FNV-1a hash → a stable hue per id. */
function hueFor(seed: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0) % 360;
}

/** A stylized profile-photo silhouette on a per-user gradient. */
function avatarSvg(id: string): string {
	const h = hueFor(id);
	const c1 = `hsl(${h} 62% 56%)`;
	const c2 = `hsl(${(h + 40) % 360} 60% 44%)`;
	const fg = "rgba(255,255,255,0.92)";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="256" height="256" fill="url(#g)"/>
  <circle cx="128" cy="102" r="46" fill="${fg}"/>
  <path d="M48 224 a80 80 0 0 1 160 0 Z" fill="${fg}"/>
</svg>`;
}

/** A monogram mark on a per-workspace gradient rounded square. */
function logoSvg(id: string, name: string): string {
	const h = hueFor(id);
	const c1 = `hsl(${h} 58% 52%)`;
	const c2 = `hsl(${(h + 32) % 360} 56% 40%)`;
	const initial = [...name.trim()][0] ?? "?";
	const glyph = /[a-z]/i.test(initial) ? initial.toUpperCase() : initial;
	const escaped = glyph.replace(/&/g, "&amp;").replace(/</g, "&lt;");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="256" height="256" rx="52" fill="url(#g)"/>
  <text x="128" y="140" text-anchor="middle" dominant-baseline="central"
    font-family="Helvetica, Arial, sans-serif" font-size="132" font-weight="700"
    fill="#ffffff">${escaped}</text>
</svg>`;
}

async function writeWebp(svg: string, path: string): Promise<void> {
	mkdirSync(dirname(path), { recursive: true });
	await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(path);
}

async function main(): Promise<void> {
	const name = process.argv[2] ?? DEFAULT_DATASET;
	const config = loadConfig(resolveSeedDataDir(name));
	const r2Dir = seedR2Dir(name);

	for (const u of config.users) {
		const id = deterministicId(`${name}:user:${u.key}`);
		await writeWebp(avatarSvg(id), join(r2Dir, "avatars", id));
	}
	for (const w of config.workspaces) {
		const id = deterministicId(`${name}:workspace:${w.key}`);
		await writeWebp(logoSvg(id, w.name), join(r2Dir, "workspaces", id, "logo"));
	}
	console.log(
		`Wrote ${config.users.length} avatar(s) and ${config.workspaces.length} logo(s) to ${r2Dir}`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
