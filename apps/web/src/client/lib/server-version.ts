import { useSyncExternalStore } from "react";

// The instance (server) version last seen on an API response's
// `x-spantail-version` header. The API client (lib/api.ts) records it on every
// response, so ordinary traffic keeps it fresh — no dedicated request or poll.
// A tiny external store (not a global-state library, per the SPA invariants)
// lets any component subscribe.
let serverVersion: string | null = null;
const listeners = new Set<() => void>();

/** Called by the API client's fetch wrapper with each response's version. */
export function recordServerVersion(version: string): void {
	if (version === serverVersion) return;
	serverVersion = version;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getSnapshot(): string | null {
	return serverVersion;
}

export function useServerVersion(): string | null {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// A version string we can meaningfully compare. Only the "unknown" fallback (no
// git history) and empty/absent are excluded — with no resolvable version we
// can't tell two builds apart. Off-tag builds (e.g. "v0.1.0-2-gabc") are
// intentionally comparable: two deploys off the same branch carry distinct
// `git describe` strings, so an old bundle is still flagged against a newer
// Worker.
function isComparable(version: string | null): version is string {
	return version != null && version !== "" && version !== "unknown";
}

/**
 * Whether the client and server versions differ meaningfully. Pure and exported
 * for testing; `useVersionMismatch` applies it to the live values.
 */
export function isVersionMismatch(
	server: string | null,
	client: string,
): boolean {
	if (!isComparable(server) || !isComparable(client)) return false;
	return server !== client;
}

/**
 * Whether the running client bundle's version differs from the instance
 * (server) version — i.e. an old cached SPA is talking to a newer Worker and
 * the user should reload. False until a comparable server version is seen.
 */
export function useVersionMismatch(): boolean {
	return isVersionMismatch(useServerVersion(), __APP_VERSION__);
}
