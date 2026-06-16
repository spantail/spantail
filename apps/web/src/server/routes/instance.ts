import {
	type EmailSettings,
	updateEmailSettingsInputSchema,
} from "@toxil/core";
import {
	getInstanceSettings,
	type InstanceSettingsRow,
	upsertInstanceSettings,
} from "@toxil/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireInstanceAdmin } from "../lib/permissions";
import { validate } from "../lib/validate";
import type { AppEnv } from "../types";

function toEmailSettings(row: InstanceSettingsRow | undefined): EmailSettings {
	return {
		emailEnabled: row?.emailEnabled ?? false,
		emailFromAddress: row?.emailFromAddress ?? null,
		emailFromName: row?.emailFromName ?? null,
	};
}

export const instanceRoutes = new Hono<AppEnv>()
	.get("/email", async (c) => {
		requireInstanceAdmin(c);
		return c.json(toEmailSettings(await getInstanceSettings(c.var.db)));
	})
	.patch("/email", async (c) => {
		requireInstanceAdmin(c);
		const input = validate(updateEmailSettingsInputSchema, await c.req.json());

		// Omitted from* fields keep their current values.
		const current = toEmailSettings(await getInstanceSettings(c.var.db));
		const emailFromAddress =
			input.emailFromAddress === undefined
				? current.emailFromAddress
				: input.emailFromAddress;
		// Enabling without a sender would make every invite fail at send time, so
		// require a from address to turn delivery on.
		if (input.emailEnabled && !emailFromAddress) {
			throw new AppError(
				"bad_request",
				"A from address is required to enable email delivery",
			);
		}
		const row = await upsertInstanceSettings(c.var.db, {
			emailEnabled: input.emailEnabled,
			emailFromAddress,
			emailFromName:
				input.emailFromName === undefined
					? current.emailFromName
					: input.emailFromName,
		});
		return c.json(toEmailSettings(row));
	});
