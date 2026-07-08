import { useSyncExternalStore } from "react";

// The instance (server) version last seen on an API response's
// `x-spantail-version` header, plus the version the user last dismissed the
// reload banner at. The API client (lib/api.ts) records the server version on
// every response, so ordinary traffic keeps it fresh — no dedicated request or
// poll. A tiny external store (not a global-state library, per the SPA
// invariants) lets any component subscribe.
let serverVersion: string | null = null;
let dismissedVersion: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

/** Called by the API client's fetch wrapper with each response's version. */
export function recordServerVersion(version: string): void {
	if (version === serverVersion) return;
	serverVersion = version;
	emit();
}

/**
 * Hides the reload banner for the current server version; it reappears once a
 * newer version is seen (the next deploy). Dismissal is in-memory by design — a
 * page reload loads the up-to-date bundle, which clears the mismatch outright,
 * so there is nothing to persist across reloads.
 */
export function dismissReloadBanner(): void {
	if (dismissedVersion === serverVersion) return;
	dismissedVersion = serverVersion;
	emit();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

// Encodes both pieces of state so useSyncExternalStore re-renders when either
// the server version or the dismissal changes, and bails out when neither does.
function getSnapshot(): string {
	return `${serverVersion ?? ""}|${dismissedVersion ?? ""}`;
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
 * for testing; `useShowReloadBanner` applies it to the live values.
 */
export function isVersionMismatch(
	server: string | null,
	client: string,
): boolean {
	if (!isComparable(server) || !isComparable(client)) return false;
	return server !== client;
}

/**
 * Whether to show the reload banner: the running client bundle's version
 * differs from the instance (server) version — an old cached SPA talking to a
 * newer Worker — and the user hasn't dismissed the banner for this version.
 */
export function useShowReloadBanner(): boolean {
	useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	return (
		isVersionMismatch(serverVersion, __APP_VERSION__) &&
		serverVersion !== dismissedVersion
	);
}
