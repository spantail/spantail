/** Space-aligned columns with an uppercase header row; no border characters. */
export function formatTable(
	headers: readonly string[],
	rows: readonly (readonly string[])[],
): string {
	const all = [headers, ...rows];
	const widths = headers.map((_, column) =>
		Math.max(...all.map((row) => (row[column] ?? "").length)),
	);
	return all
		.map((row) =>
			row
				.map((cell, column) => cell.padEnd(widths[column] ?? 0))
				.join("  ")
				.trimEnd(),
		)
		.join("\n");
}

export function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
