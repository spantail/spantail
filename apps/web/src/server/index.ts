import { Hono } from "hono";

import { createAuth } from "./auth";
import { errorResponse } from "./lib/errors";
import { registerMcpRoute } from "./mcp";
import { loadAuth } from "./middleware/auth";
import { requestContext } from "./middleware/context";
import { meRoutes } from "./routes/me";
import { projectRoutes } from "./routes/projects";
import { reportShareRoutes } from "./routes/report-shares";
import { reportSnapshotRoutes } from "./routes/report-snapshots";
import { reportTemplateRoutes } from "./routes/report-templates";
import { reportRoutes } from "./routes/reports";
import { tokenRoutes } from "./routes/tokens";
import { workEntryRoutes } from "./routes/work-entries";
import { workspaceRoutes } from "./routes/workspaces";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.onError((error, c) => errorResponse(c, error));
app.notFound((c) =>
	c.json({ error: { code: "not_found", message: "Not found" } }, 404),
);

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.use("/api/*", requestContext);

app.on(["GET", "POST"], "/api/auth/*", (c) => {
	return createAuth(c.env, c.var.db).handler(c.req.raw);
});

const v1 = new Hono<AppEnv>();
v1.use(loadAuth);
v1.route("/me", meRoutes);
v1.route("/workspaces", workspaceRoutes);
v1.route("/projects", projectRoutes);
v1.route("/report-shares", reportShareRoutes);
v1.route("/report-snapshots", reportSnapshotRoutes);
v1.route("/report-templates", reportTemplateRoutes);
v1.route("/reports", reportRoutes);
v1.route("/work-entries", workEntryRoutes);
v1.route("/tokens", tokenRoutes);

app.route("/api/v1", v1);

// Registered last; closes over the finished app for loopback API calls.
registerMcpRoute(app);

export default app;
