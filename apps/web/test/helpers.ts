import { exports } from "cloudflare:workers";

export const BASE = "https://example.com";

export function appFetch(path: string, init?: RequestInit): Promise<Response> {
	return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

/** Signs up a user and returns their session cookie. */
export async function signUpUser(name: string, email: string): Promise<string> {
	const res = await appFetch("/api/auth/sign-up/email", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name, email, password: "password1234" }),
	});
	if (res.status !== 200) {
		throw new Error(`sign-up failed with ${res.status}: ${await res.text()}`);
	}
	const setCookie = res.headers.get("set-cookie");
	const cookie = setCookie?.split(";")[0];
	if (!cookie) throw new Error("sign-up did not set a session cookie");
	return cookie;
}

export async function apiGet(path: string, cookie?: string): Promise<Response> {
	return appFetch(path, { headers: cookie ? { cookie } : {} });
}

export async function apiJson(
	method: "POST" | "PATCH" | "DELETE",
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
