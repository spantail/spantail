import { type Database, seedCatalogReportTemplates } from "@spantail/db";
import {
	type CatalogLocale,
	catalogTemplatesForLocale,
} from "@spantail/templates";

/**
 * Seed the starter catalog (Daily, Weekly, Monthly; Daily is the default) in
 * `locale`, so an instance always has composable report templates. Called once
 * when the first user (the instance admin) signs up. Idempotent (fixed ids +
 * onConflictDoNothing), so a retried bootstrap converges on one row per
 * template.
 */
export async function seedStarterTemplates(
	db: Database,
	locale: CatalogLocale,
): Promise<void> {
	const catalog = catalogTemplatesForLocale(locale);
	await seedCatalogReportTemplates(
		db,
		catalog.map((template) => ({
			id: template.key,
			name: template.name,
			description: template.description,
			body: template.body,
			isDefault: template.isDefault,
			nameTemplate: template.nameTemplate,
			noteTemplate: template.noteTemplate,
			defaultDateRange: template.defaultDateRange,
			createdBy: null,
		})),
	);
}
