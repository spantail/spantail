/** Locales a catalog template is authored in (mirrors the SPA i18n catalogs). */
export type CatalogLocale = "en" | "ja";

/** Metadata for a catalog template; the body is attached by index.ts / node.ts. */
export interface CatalogEntry {
	/** Catalog key shared across locales (e.g. "default"). */
	key: string;
	locale: CatalogLocale;
	name: string;
	description: string;
}

/**
 * Default report templates shipped with the product. A fresh instance is seeded
 * with one of these (matching the first admin's locale) as an ordinary
 * `report_templates` row. They are period-agnostic presentation formats: the
 * report's date range is chosen at run time, not baked into the template.
 */
export const templateCatalog: CatalogEntry[] = [
	{
		key: "default",
		locale: "en",
		name: "Work report",
		description: "Entries grouped by project for the selected period.",
	},
	{
		key: "default",
		locale: "ja",
		name: "稼働レポート",
		description: "選択した期間のエントリをプロジェクト別にまとめます。",
	},
];
