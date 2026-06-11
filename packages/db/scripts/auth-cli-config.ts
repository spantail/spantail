import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { authOptions } from "../src/auth-options";

/**
 * Stub config consumed only by `@better-auth/cli generate` to produce the
 * Drizzle auth schema (src/schema/auth.ts). It is never executed at runtime;
 * the real instance lives in apps/web/src/server/auth.ts.
 */
export const auth = betterAuth({
	...authOptions,
	database: drizzleAdapter({} as never, { provider: "sqlite" }),
});
