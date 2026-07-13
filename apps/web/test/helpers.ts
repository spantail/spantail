import { exports } from "cloudflare:workers";

export const BASE = "https://example.com";

export function appFetch(path: string, init?: RequestInit): Promise<Response> {
	return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

function cookieFromResponse(res: Response): string {
	const setCookie = res.headers.get("set-cookie");
	const cookie = setCookie?.split(";")[0];
	if (!cookie) throw new Error("response did not set a session cookie");
	return cookie;
}

// The first user becomes the instance admin and is the only one allowed to
// sign up publicly; later users are created through the admin API. Remembering
// the bootstrap cookie lets signUpUser stay a drop-in helper for every test.
let bootstrapAdminCookie: string | null = null;

/** Cleared by the test setup's beforeEach (storage resets between tests). */
export function resetTestState(): void {
	bootstrapAdminCookie = null;
}

/** Signs up (or, post-bootstrap, admin-creates) a user and returns their cookie. */
export async function signUpUser(name: string, email: string): Promise<string> {
	const res = await appFetch("/api/auth/sign-up/email", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name, email, password: "password1234" }),
	});
	if (res.status === 200) {
		const cookie = cookieFromResponse(res);
		bootstrapAdminCookie ??= cookie;
		return cookie;
	}
	if (res.status !== 403) {
		throw new Error(`sign-up failed with ${res.status}: ${await res.text()}`);
	}

	// Public sign-up is closed after the first user: create via the instance
	// admin and sign in with the generated password to obtain a session.
	if (!bootstrapAdminCookie) {
		throw new Error("public sign-up is closed but no bootstrap admin exists");
	}
	const created = await apiJson(
		"POST",
		"/api/v1/users",
		{ email, name },
		bootstrapAdminCookie,
	);
	if (created.status !== 201) {
		throw new Error(
			`admin user create failed with ${created.status}: ${await created.text()}`,
		);
	}
	const { generatedPassword } = (await created.json()) as {
		generatedPassword?: string;
	};
	if (!generatedPassword) throw new Error("create did not return a password");

	const signIn = await appFetch("/api/auth/sign-in/email", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email, password: generatedPassword }),
	});
	if (signIn.status !== 200) {
		throw new Error(
			`sign-in failed with ${signIn.status}: ${await signIn.text()}`,
		);
	}
	return cookieFromResponse(signIn);
}

/**
 * Creates a *second* instance admin through the bootstrap admin and returns
 * their session cookie. Requires a prior signUpUser to have established the
 * bootstrap admin. Useful for testing the instance-admin workspace bypass,
 * which needs an admin who is not a member of a workspace another admin owns.
 */
export async function signUpAdmin(
	name: string,
	email: string,
): Promise<string> {
	if (!bootstrapAdminCookie) {
		throw new Error("signUpAdmin requires an existing bootstrap admin");
	}
	const created = await apiJson(
		"POST",
		"/api/v1/users",
		{ email, name, grantAdmin: true },
		bootstrapAdminCookie,
	);
	if (created.status !== 201) {
		throw new Error(
			`admin create failed with ${created.status}: ${await created.text()}`,
		);
	}
	const { generatedPassword } = (await created.json()) as {
		generatedPassword?: string;
	};
	if (!generatedPassword) throw new Error("create did not return a password");

	const signIn = await appFetch("/api/auth/sign-in/email", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email, password: generatedPassword }),
	});
	if (signIn.status !== 200) {
		throw new Error(
			`sign-in failed with ${signIn.status}: ${await signIn.text()}`,
		);
	}
	return cookieFromResponse(signIn);
}

export async function apiGet(path: string, cookie?: string): Promise<Response> {
	return appFetch(path, { headers: cookie ? { cookie } : {} });
}

/**
 * The id of the lazily-seeded instance default report template. Reports need a
 * real template id now that builtins are gone; reading the list seeds the
 * starter catalog when the instance has none. Selects the row flagged
 * isDefault (Daily) — the one-default unique index guarantees it is unique — so
 * a pre-existing custom template can't shadow it.
 */
export async function defaultTemplateId(cookie: string): Promise<string> {
	const res = await apiGet("/api/v1/report-templates", cookie);
	if (!res.ok) {
		throw new Error(
			`report-templates list failed: ${res.status} ${await res.text()}`,
		);
	}
	const list = (await res.json()) as Array<{ id: string; isDefault: boolean }>;
	const found = list.find((t) => t.isDefault);
	if (!found) throw new Error("no default report template was seeded");
	return found.id;
}

export async function apiJson(
	method: "POST" | "PUT" | "PATCH" | "DELETE",
	path: string,
	body: unknown,
	cookie?: string,
): Promise<Response> {
	return appFetch(path, {
		method,
		headers: {
			"content-type": "application/json",
			...(cookie ? { cookie } : {}),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}
