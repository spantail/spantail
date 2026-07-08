import { expect, it } from "vitest";

import { appFetch } from "../../test/helpers";

it("stamps API responses with the instance version header", async () => {
	// A public /api/v1 endpoint (no auth) still passes through the version
	// middleware; the SPA reads this header off ordinary traffic. (/api/health
	// is registered before the middleware, so it is intentionally uncovered.)
	const res = await appFetch("/api/v1/instance/email-enabled");
	expect(res.status).toBe(200);
	expect(res.headers.get("x-spantail-version")).toBeTruthy();
});
