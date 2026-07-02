import { schema } from "@spantail/db";
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

// Rows per multi-row INSERT, and a byte ceiling per statement. D1 rejects any
// single SQL statement over ~100 KB (SQLITE_TOOBIG), which a 100-row chunk of
// report bodies (each with the front-matter header) can exceed, so a statement
// is flushed on whichever bound hits first. The ceiling keeps a comfortable
// margin under D1's limit; individual seeded rows are far smaller, so one always
// fits in its own statement worst case.
const CHUNK = 100;
const MAX_STATEMENT_BYTES = 80_000;

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
		const prefix = `INSERT INTO "${tableName}" (${columnList}) VALUES\n`;

		let batch: string[] = [];
		let batchBytes = prefix.length;
		const flush = () => {
			if (batch.length === 0) return;
			statements.push(`${prefix}${batch.join(",\n")};`);
			batch = [];
			batchBytes = prefix.length;
		};
		for (const row of rows) {
			const cells = keys.map((k) => {
				const column = columns[k];
				if (!column) throw new Error(`unknown column ${table}.${k}`);
				const raw = (row as Record<string, unknown>)[k];
				if (raw === null || raw === undefined) return "NULL";
				return literal(column.mapToDriverValue(raw));
			});
			const tuple = `(${cells.join(", ")})`;
			// Flush before the row cap or the byte ceiling would be exceeded, but keep
			// at least one tuple per statement so an oversized single row still emits.
			if (
				batch.length > 0 &&
				(batch.length >= CHUNK ||
					batchBytes + tuple.length + 2 > MAX_STATEMENT_BYTES)
			) {
				flush();
			}
			batch.push(tuple);
			batchBytes += tuple.length + 2;
		}
		flush();
	}
	return `${statements.join("\n")}\n`;
}
