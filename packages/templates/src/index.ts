/// <reference path="./liquid-raw.d.ts" />
import defaultEn from "../catalog/default.en.liquid?raw";
import defaultJa from "../catalog/default.ja.liquid?raw";
import {
	type CatalogEntry,
	type CatalogLocale,
	templateCatalog,
} from "./manifest";

export * from "./manifest";

/** A catalog entry with its Liquid body resolved. */
export interface CatalogTemplate extends CatalogEntry {
	body: string;
}

// Bodies are bundled into the Worker by Vite (`?raw`); there is no filesystem at
// runtime. The Node seed reads the same files via `@spantail/templates/node`.
const BODIES: Record<string, string> = {
	"default:en": defaultEn,
	"default:ja": defaultJa,
};

export const defaultTemplates: CatalogTemplate[] = templateCatalog.map(
	(entry) => {
		const body = BODIES[`${entry.key}:${entry.locale}`];
		if (body === undefined) {
			throw new Error(`no body for template ${entry.key}:${entry.locale}`);
		}
		return { ...entry, body };
	},
);

/** The default template for a locale, falling back to English. */
export function defaultTemplateForLocale(
	locale: CatalogLocale,
): CatalogTemplate {
	const match =
		defaultTemplates.find((t) => t.key === "default" && t.locale === locale) ??
		defaultTemplates.find((t) => t.key === "default" && t.locale === "en");
	if (!match) throw new Error("default template catalog is empty");
	return match;
}
