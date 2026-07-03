import type { ReportFilters } from "@spantail/core";
import { expect, it } from "vitest";

import { createClient } from "./client";
import { saveConfig } from "./config";
import { buildReportFilters } from "./report-filters";
import {
	createTestContext,
	fakeApi,
	memberFixture,
	projectFixture,
	workspaceFixture,
} from "./test-helpers";

const acme = workspaceFixture("acme");
const beta = workspaceFixture("beta");
const apiProject = projectFixture("api", acme.id);
const webProject = projectFixture("web", acme.id);
const alice = memberFixture({ userId: "u1", email: "alice@example.com" });

function setup() {
	const stub = fakeApi([
		{ path: "/workspaces", body: [acme, beta] },
		{ path: `/workspaces/${acme.id}/projects`, body: [apiProject, webProject] },
		{ path: `/workspaces/${acme.id}/members`, body: [alice] },
	]);
	const { ctx, stderr, configDir } = createTestContext({ fetch: stub.fetch });
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
		defaultWorkspace: "acme",
	});
	const client = createClient(ctx, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
	});
	return { client, ctx, stderr };
}

it("maps hyphenated presets and defaults to the configured workspace", async () => {
	const { client, ctx } = setup();
	const filters = await buildReportFilters(client, ctx, {
		range: "last-30-days",
	});
	expect(filters).toEqual({
		workspaceIds: [acme.id],
		projectIds: undefined,
		userIds: undefined,
		tags: undefined,
		dateRange: "last_30_days",
	});
});

it("accepts an absolute --from/--to range", async () => {
	const { client, ctx } = setup();
	const filters = await buildReportFilters(client, ctx, {
		from: "2026-06-01",
		to: "2026-06-15",
	});
	expect(filters.dateRange).toEqual({ from: "2026-06-01", to: "2026-06-15" });
});

it("falls back to the given range when no range flag is set", async () => {
	const { client, ctx } = setup();
	const filters = await buildReportFilters(
		client,
		ctx,
		{},
		{ fallbackRange: "last_week" },
	);
	expect(filters.dateRange).toBe("last_week");
});

it("resolves project slugs, user emails, and tags", async () => {
	const { client, ctx } = setup();
	const filters = await buildReportFilters(client, ctx, {
		project: ["api", "web"],
		user: ["alice@example.com"],
		tag: ["infra"],
	});
	expect(filters.projectIds).toEqual([apiProject.id, webProject.id]);
	expect(filters.userIds).toEqual(["u1"]);
	expect(filters.tags).toEqual(["infra"]);
});

it("supports instance scope with raw user ids but rejects emails", async () => {
	const { client, ctx } = setup();
	const filters = await buildReportFilters(client, ctx, {
		"all-workspaces": true,
		user: ["u1"],
	});
	expect(filters.workspaceIds).toEqual([]);
	expect(filters.userIds).toEqual(["u1"]);

	await expect(
		buildReportFilters(client, ctx, {
			"all-workspaces": true,
			user: ["alice@example.com"],
		}),
	).rejects.toThrow("emails need a workspace scope");
});

it("rejects conflicting and incomplete flag combinations", async () => {
	const { client, ctx } = setup();
	const cases: Array<{
		flags: Parameters<typeof buildReportFilters>[2];
		message: string;
	}> = [
		{
			flags: { workspace: "acme", "all-workspaces": true },
			message: "mutually exclusive",
		},
		{
			flags: { range: "today", from: "2026-06-01", to: "2026-06-15" },
			message: "mutually exclusive",
		},
		{ flags: { from: "2026-06-01" }, message: "given together" },
		{ flags: { range: "junk" }, message: 'invalid --range "junk"' },
		{
			flags: { from: "2026-06-15", to: "2026-06-01" },
			message: "invalid --from/--to",
		},
		{
			flags: { "all-workspaces": true, project: ["api"] },
			message: "--project requires a workspace scope",
		},
	];
	for (const { flags, message } of cases) {
		await expect(buildReportFilters(client, ctx, flags)).rejects.toThrow(
			message,
		);
	}
});

it("keeps the base filters when editing without flags", async () => {
	const { client, ctx } = setup();
	const base: ReportFilters = {
		workspaceIds: [acme.id],
		projectIds: [apiProject.id],
		userIds: ["u1"],
		tags: ["infra"],
		dateRange: { from: "2026-06-01", to: "2026-06-15" },
	};
	const filters = await buildReportFilters(client, ctx, {}, { base });
	expect(filters).toEqual({ ...base });
});

it("clears a kept project filter when the workspace scope changes", async () => {
	const { client, ctx, stderr } = setup();
	const base: ReportFilters = {
		workspaceIds: [beta.id],
		projectIds: ["proj-other"],
		dateRange: { from: "2026-06-01", to: "2026-06-15" },
	};
	const filters = await buildReportFilters(
		client,
		ctx,
		{ workspace: "acme" },
		{ base },
	);
	expect(filters.workspaceIds).toEqual([acme.id]);
	expect(filters.projectIds).toBeUndefined();
	expect(stderr.text()).toContain("cleared the project filter");
});

it("requires an explicit scope for a legacy multi-workspace report", async () => {
	const { client, ctx } = setup();
	const base: ReportFilters = {
		workspaceIds: [acme.id, beta.id],
		dateRange: { from: "2026-06-01", to: "2026-06-15" },
	};
	await expect(buildReportFilters(client, ctx, {}, { base })).rejects.toThrow(
		"legacy multi-workspace scope",
	);
});
