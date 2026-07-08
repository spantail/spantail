/**
 * Canonical origin for user-facing links (password-reset and invitation emails,
 * OAuth callbacks).
 *
 * `BETTER_AUTH_URL` is optional. When set it wins — pin it to a canonical origin
 * behind a custom domain or a proxy that rewrites the host. When unset (the
 * zero-config path for a fresh Workers deploy served from its `*.workers.dev`
 * origin), the base is derived from the incoming request so links resolve to
 * wherever the instance actually answers.
 *
 * The returned value never carries a trailing slash, so callers can append a
 * path directly.
 */
export function appBaseUrl(
	env: { BETTER_AUTH_URL?: string },
	request: Request | undefined,
): string {
	const configured = env.BETTER_AUTH_URL?.trim();
	if (configured) return configured.replace(/\/$/, "");
	if (!request) {
		// Neither a configured origin nor a request to derive one from. This is a
		// programming error (the caller is outside any HTTP request); fail loudly
		// rather than emit a broken link.
		throw new Error(
			"Cannot resolve the app base URL: set BETTER_AUTH_URL or call from a request context.",
		);
	}
	return new URL(request.url).origin;
}
