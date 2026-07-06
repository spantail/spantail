/**
 * GitHub App Manifest flow: the SPA posts a form with this manifest JSON to
 * github.com; GitHub creates the App and redirects back to
 * `/api/github/setup?code=...` for the credential conversion.
 */

/** GitHub caps App names at 34 characters. */
const APP_NAME_MAX = 34;

export function buildAppManifest(origin: string): Record<string, unknown> {
	const host = new URL(origin).host;
	return {
		// Instance host in the name keeps multiple self-hosted Apps tellable
		// apart within one owner account.
		name: `Spantail (${host})`.slice(0, APP_NAME_MAX),
		url: origin,
		hook_attributes: { url: `${origin}/api/github/webhook` },
		redirect_url: `${origin}/api/github/setup`,
		callback_urls: [`${origin}/api/github/connect/callback`],
		// A BYO App's webhook is pinned to this instance: public would only
		// invite unrelated installations (issue #159). Never user-configurable.
		public: false,
		// Fixed in v1 — adding permissions later forces re-approval on every
		// installation, so keep this the settled minimal set.
		default_permissions: {
			metadata: "read",
			issues: "write",
			pull_requests: "write",
		},
		// Installation lifecycle events are always delivered to Apps and are
		// not listed here.
		default_events: [
			"issue_comment",
			"issues",
			"pull_request",
			"pull_request_review",
		],
	};
}

/** Where the manifest form posts: the owner decides who owns the App. */
export function manifestFormAction(owner: string | null): string {
	return owner
		? `https://github.com/organizations/${encodeURIComponent(owner)}/settings/apps/new`
		: "https://github.com/settings/apps/new";
}
