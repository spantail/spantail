import { ToxilClient } from "@toxil/sdk";

/** API client for the same-origin Worker; session cookies ride along. */
export const api = new ToxilClient({ baseUrl: window.location.origin });
