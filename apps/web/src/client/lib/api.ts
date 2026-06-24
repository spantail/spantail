import { SpantailClient } from "@spantail/sdk";

/** API client for the same-origin Worker; session cookies ride along. */
export const api = new SpantailClient({ baseUrl: window.location.origin });
