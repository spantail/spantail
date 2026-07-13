/// <reference path="./liquid-raw.d.ts" />
import dailyEn from "../catalog/daily.en.liquid?raw";
import dailyJa from "../catalog/daily.ja.liquid?raw";
import monthlyEn from "../catalog/monthly.en.liquid?raw";
import monthlyJa from "../catalog/monthly.ja.liquid?raw";
import weeklyEn from "../catalog/weekly.en.liquid?raw";
import weeklyJa from "../catalog/weekly.ja.liquid?raw";
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
	"daily:en": dailyEn,
	"daily:ja": dailyJa,
	"weekly:en": weeklyEn,
	"weekly:ja": weeklyJa,
	"monthly:en": monthlyEn,
	"monthly:ja": monthlyJa,
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

/** The catalog templates for a locale, falling back to English. */
export function catalogTemplatesForLocale(
	locale: CatalogLocale,
): CatalogTemplate[] {
	const match = defaultTemplates.filter((t) => t.locale === locale);
	return match.length > 0
		? match
		: defaultTemplates.filter((t) => t.locale === "en");
}
