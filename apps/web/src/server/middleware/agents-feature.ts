import { getInstanceSettings } from "@toxil/db";
import { createMiddleware } from "hono/factory";

import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

/**
 * Gates the agents feature, which an instance admin must opt into (off by
 * default; see instance_settings.agents_enabled). Applied to the agents
 * registry, access-token, and ingest routes so the whole feature is dark when
 * disabled.
 */
export const requireAgentsFeature = createMiddleware<AppEnv>(
	async (c, next) => {
		const settings = await getInstanceSettings(c.var.db);
		if (!settings?.agentsEnabled) {
			throw new AppError(
				"forbidden",
				"The agents feature is disabled on this instance",
			);
		}
		await next();
	},
);
