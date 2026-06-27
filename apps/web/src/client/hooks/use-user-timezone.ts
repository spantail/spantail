import { resolveUserTimezone } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

/**
 * The current user's effective IANA timezone (their setting, else UTC). Timezone
 * is a per-user concept — local dates, the home timeline, and clock display all
 * resolve in it. Reuses the shared `me` query (already loaded by AuthedRoot), so
 * it normally reads from cache rather than issuing its own request.
 */
export function useUserTimezone(): string {
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
	return resolveUserTimezone(me.data?.user.timezone ?? null);
}
