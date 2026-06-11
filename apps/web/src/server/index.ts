import { createDb } from "@toxil/db";
import { Hono } from "hono";

import { createAuth } from "./auth";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.on(["GET", "POST"], "/api/auth/*", (c) => {
	const db = createDb(c.env.DB);
	return createAuth(c.env, db).handler(c.req.raw);
});

export default app;
