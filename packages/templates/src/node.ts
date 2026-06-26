import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { type CatalogEntry, templateCatalog } from "./manifest";

export * from "./manifest";

/** A catalog entry with its Liquid body resolved. */
export interface CatalogTemplate extends CatalogEntry {
	body: string;
}

// Node entry for the local `db:seed` (tsx), which has filesystem access and
// cannot resolve Vite's `?raw` imports. Reads the same `.liquid` files the
// Worker bundles via `@spantail/templates`.
const CATALOG_DIR = fileURLToPath(new URL("../catalog/", import.meta.url));

export const defaultTemplates: CatalogTemplate[] = templateCatalog.map(
	(entry) => ({
		...entry,
		body: readFileSync(
			join(CATALOG_DIR, `${entry.key}.${entry.locale}.liquid`),
			"utf8",
		),
	}),
);
