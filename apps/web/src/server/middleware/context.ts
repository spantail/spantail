import { createDb } from "@spantail/db";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../types";

/** One Drizzle instance per request, shared by all downstream handlers. */
export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
	c.set("db", createDb(c.env.DB));
	c.set("auth", null);
	await next();
});
