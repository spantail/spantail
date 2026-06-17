import { countUsers } from "@toxil/db";
import { Hono } from "hono";

import { createAuth } from "./auth";
import { errorResponse } from "./lib/errors";
import { registerMcpRoute } from "./mcp";
import { loadAuth } from "./middleware/auth";
import { requestContext } from "./middleware/context";
import { devMailRoutes } from "./routes/dev-mail";
import { inboxRoutes } from "./routes/inbox";
import { instanceRoutes } from "./routes/instance";
import { invitationRoutes } from "./routes/invitations";
import { meRoutes } from "./routes/me";
import { projectRoutes } from "./routes/projects";
import { reportDiscussionRoutes } from "./routes/report-discussion";
import { reportShareRoutes } from "./routes/report-shares";
import { reportTemplateRoutes } from "./routes/report-templates";
import { reportRoutes } from "./routes/reports";
import { shareRoutes } from "./routes/share";
import { tokenRoutes } from "./routes/tokens";
import { userRoutes } from "./routes/users";
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

app.on(["GET", "POST"], "/api/auth/*", async (c) => {
	// Onboarding is admin-driven (invitations / direct create), so public
	// sign-up is closed once the bootstrap admin (the first user) exists.
	const url = new URL(c.req.url);
	if (
		c.req.method === "POST" &&
		url.pathname === "/api/auth/sign-up/email" &&
		(await countUsers(c.var.db)) > 0
	) {
		return c.json(
			{
				error: {
					code: "forbidden",
					message:
						"Public sign-up is disabled; ask an instance admin for an invitation",
				},
			},
			403,
		);
	}
	return createAuth(c.env, c.var.db, c.executionCtx).handler(c.req.raw);
});

const v1 = new Hono<AppEnv>();
v1.use(loadAuth);
v1.route("/me", meRoutes);
v1.route("/inbox", inboxRoutes);
v1.route("/users", userRoutes);
v1.route("/invitations", invitationRoutes);
v1.route("/instance", instanceRoutes);
v1.route("/workspaces", workspaceRoutes);
v1.route("/projects", projectRoutes);
v1.route("/report-shares", reportShareRoutes);
v1.route("/report-templates", reportTemplateRoutes);
v1.route("/reports", reportRoutes);
// Discussion endpoints (/reports/:id/discussion, comments, reactions) for the
// owner + Send-to recipients; mounted after reportRoutes on the same prefix.
v1.route("/reports", reportDiscussionRoutes);
v1.route("/work-entries", workEntryRoutes);
v1.route("/tokens", tokenRoutes);

app.route("/api/v1", v1);

// Development-only email outbox viewer (404s in production).
app.route("/api/dev/mail", devMailRoutes);

// Public share views: unauthenticated HTML, outside /api.
app.use("/share/*", requestContext);
app.route("/share", shareRoutes);

// Registered last; closes over the finished app for loopback API calls.
registerMcpRoute(app);

export default app;
