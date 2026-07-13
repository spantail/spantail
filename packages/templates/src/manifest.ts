import type { DateRangePreset } from "@spantail/core";

/** Locales a catalog template is authored in (mirrors the SPA i18n catalogs). */
export type CatalogLocale = "en" | "ja";

/** Metadata for a catalog template; the body is attached by index.ts / node.ts. */
export interface CatalogEntry {
	/** Catalog key shared across locales (e.g. "daily"). Also the seeded row id. */
	key: string;
	locale: CatalogLocale;
	name: string;
	description: string;
	/** The instance default among the seeded catalog (exactly one per locale). */
	isDefault: boolean;
	/** Relative range a new report seeds with when composed from this template. */
	defaultDateRange: DateRangePreset;
	/** Liquid for a new report's initial name/note (null = no suggestion). */
	nameTemplate: string | null;
	noteTemplate: string | null;
}

// The seeded templates reproduce the former built-in auto-name
// (`{workspace} {user} {period}`) now that initial names come only from a
// template. The workspace name is shown only for a single-workspace scope:
// instance scope resolves to every workspace the user belongs to, so naming it
// after whichever comes first would mislabel an all-workspace report. Names are
// interpolated data, so both locales share one string; `period.label` already
// distinguishes a day, a week range, and a month, so one name template fits all
// three types.
const DEFAULT_NAME_TEMPLATE =
	"{% if workspaces.size == 1 %}{{ workspaces[0].name }} {% endif %}{{ user.name }} {{ period.label }}";

/**
 * Default report templates shipped with the product. A fresh instance is seeded
 * with the three that match the first admin's locale (Daily, Weekly, Monthly);
 * Daily is the instance default. Each carries a `defaultDateRange` that only
 * seeds the compose dialog's range — the templates themselves stay
 * period-agnostic, so any template still renders any date range at run time.
 */
export const templateCatalog: CatalogEntry[] = [
	{
		key: "daily",
		locale: "en",
		name: "Daily report",
		description:
			"One day's work across your workspaces, entry by entry — for a daily meeting.",
		isDefault: true,
		defaultDateRange: "today",
		nameTemplate: DEFAULT_NAME_TEMPLATE,
		noteTemplate: null,
	},
	{
		key: "daily",
		locale: "ja",
		name: "日報",
		description:
			"1日の作業をワークスペース横断でエントリごとに報告します。朝会・夕会向け。",
		isDefault: true,
		defaultDateRange: "today",
		nameTemplate: DEFAULT_NAME_TEMPLATE,
		noteTemplate: null,
	},
	{
		key: "weekly",
		locale: "en",
		name: "Weekly report",
		description:
			"The week's activity grouped by project — for an iteration meeting.",
		isDefault: false,
		defaultDateRange: "this_week",
		nameTemplate: DEFAULT_NAME_TEMPLATE,
		noteTemplate: null,
	},
	{
		key: "weekly",
		locale: "ja",
		name: "週報",
		description:
			"1週間の活動をプロジェクト別にまとめます。イテレーションの共有向け。",
		isDefault: false,
		defaultDateRange: "this_week",
		nameTemplate: DEFAULT_NAME_TEMPLATE,
		noteTemplate: null,
	},
	{
		key: "monthly",
		locale: "en",
		name: "Monthly report",
		description:
			"A monthly work report to submit to a client — summary first, then the work log.",
		isDefault: false,
		defaultDateRange: "this_month",
		nameTemplate: DEFAULT_NAME_TEMPLATE,
		noteTemplate: null,
	},
	{
		key: "monthly",
		locale: "ja",
		name: "月報",
		description:
			"クライアントに提出する月次の作業報告書。概要と作業明細をまとめます。",
		isDefault: false,
		defaultDateRange: "this_month",
		nameTemplate: DEFAULT_NAME_TEMPLATE,
		noteTemplate: null,
	},
];
