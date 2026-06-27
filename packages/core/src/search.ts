import { z } from "zod";

import { workEntrySchema } from "./work-entry";

/** Max query length keeps the LIKE scan bounded and the input sane. */
export const searchQuerySchema = z.object({
	q: z.string().trim().min(1).max(100),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** Minimal report shape for a search hit — enough to label and navigate to it. */
export const searchReportResultSchema = z.object({
	id: z.string(),
	name: z.string(),
});
export type SearchReportResult = z.infer<typeof searchReportResultSchema>;

/**
 * Top-bar search results, grouped by entity type. Work entries reuse the full
 * `WorkEntry` shape so the client can open the view dialog without a refetch;
 * reports carry only what a result row needs.
 */
export const searchResponseSchema = z.object({
	workEntries: z.array(workEntrySchema),
	reports: z.array(searchReportResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
