import { schema } from "@toxil/db";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type { SeededTable } from "./generate";

function literal(value: unknown): string {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number")
		return Number.isFinite(value) ? String(value) : "NULL";
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "boolean") return value ? "1" : "0";
	return `'${String(value).replace(/'/g, "''")}'`;
}

const CHUNK = 100;

/**
 * Serializes seeded rows to multi-row INSERT statements. Column names and value
 * encoding (booleans → 0/1, Date → ms, json → text) come straight from the
 * Drizzle schema via `mapToDriverValue`, so this never drifts from the tables.
 */
export function datasetToSql(tables: SeededTable[]): string {
	const statements: string[] = [];
	for (const { table, rows } of tables) {
		if (rows.length === 0) continue;
		const drizzleTable = (schema as Record<string, unknown>)[
			table
		] as SQLiteTable;
		if (!drizzleTable) throw new Error(`unknown schema table: ${table}`);
		const columns = getTableColumns(drizzleTable);
		const tableName = getTableName(drizzleTable);
		const keys = Object.keys(rows[0] as Record<string, unknown>);
		const columnList = keys.map((k) => `"${columns[k]?.name}"`).join(", ");

		for (let i = 0; i < rows.length; i += CHUNK) {
			const chunk = rows.slice(i, i + CHUNK);
			const values = chunk
				.map((row) => {
					const cells = keys.map((k) => {
						const column = columns[k];
						if (!column) throw new Error(`unknown column ${table}.${k}`);
						const raw = (row as Record<string, unknown>)[k];
						if (raw === null || raw === undefined) return "NULL";
						return literal(column.mapToDriverValue(raw));
					});
					return `(${cells.join(", ")})`;
				})
				.join(",\n");
			statements.push(
				`INSERT INTO "${tableName}" (${columnList}) VALUES\n${values};`,
			);
		}
	}
	return `${statements.join("\n")}\n`;
}
