import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { expect, it } from "vitest";

import { SpantailApiError, type SpantailClient } from "./index";
import { registerSpantailTools } from "./mcp";

function makeStub() {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const record =
		(method: string, result: unknown = []) =>
		(...args: unknown[]) => {
			calls.push({ method, args });
			return Promise.resolve(result);
		};
	const stub = {
		listWorkspaces: record("listWorkspaces", [{ id: "ws1", name: "Acme" }]),
		listProjects: record("listProjects", [{ id: "p1" }]),
		createWorkEntry: record("createWorkEntry", {
			id: "e1",
			entryDate: "2026-06-11",
		}),
		listWorkEntries: record("listWorkEntries", []),
		updateWorkEntry: record("updateWorkEntry", { id: "e1" }),
		deleteWorkEntry: record("deleteWorkEntry", undefined),
		listReportTemplates: record("listReportTemplates", [{ id: "tmpl-1" }]),
		listReports: record("listReports", [{ id: "r1" }]),
		getReport: record("getReport", {
			id: "r1",
			name: "Weekly",
			templateId: "tmpl-1",
			note: null,
			filters: {
				workspaceIds: ["ws1"],
				tags: ["infra"],
				dateRange: { from: "2026-06-08", to: "2026-06-14" },
			},
			renderedMarkdown: "# Report",
		}),
		createReport: record("createReport", { id: "r2", name: "Created" }),
		updateReport: record("updateReport", { id: "r1", version: 2 }),
		previewReport: record("previewReport", {
			content: "# Preview",
			totalMinutes: 60,
			entryCount: 1,
			projectCount: 1,
			suggestedName: "Weekly 2026-06-08",
			suggestedNote: "",
		}),
		search: record("search", { workEntries: [], reports: [] }),
	} as unknown as SpantailClient;
	return { stub, calls };
}

async function connect(client: SpantailClient) {
	const server = new McpServer({ name: "spantail-test", version: "0.0.0" });
	registerSpantailTools(server, client);
	const mcpClient = new Client({ name: "test-client", version: "0.0.0" });
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await Promise.all([
		server.connect(serverTransport),
		mcpClient.connect(clientTransport),
	]);
	return mcpClient;
}

it("exposes the thirteen spantail tools", async () => {
	const { stub } = makeStub();
	const client = await connect(stub);

	const { tools } = await client.listTools();
	expect(tools.map((tool) => tool.name).sort()).toEqual([
		"create_report",
		"delete_entry",
		"get_report",
		"list_entries",
		"list_projects",
		"list_report_templates",
		"list_reports",
		"list_workspaces",
		"log_work",
		"preview_report",
		"search",
		"update_entry",
		"update_report",
	]);
});

it("routes get_report to the api client", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	const result = await client.callTool({
		name: "get_report",
		arguments: { id: "r1" },
	});

	expect(calls.at(-1)?.method).toBe("getReport");
	expect(calls.at(-1)?.args[0]).toBe("r1");
	const content = result.content as Array<{ type: string; text: string }>;
	expect(JSON.parse(content[0]?.text ?? "")).toMatchObject({
		renderedMarkdown: "# Report",
	});
});

it("routes tool calls to the api client and returns json text", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	const result = await client.callTool({
		name: "log_work",
		arguments: {
			workspaceId: "ws1",
			projectId: "p1",
			durationMinutes: 30,
			description: "via mcp",
		},
	});

	expect(calls.at(-1)?.method).toBe("createWorkEntry");
	expect(calls.at(-1)?.args[0]).toMatchObject({
		workspaceId: "ws1",
		durationMinutes: 30,
	});
	const content = result.content as Array<{ type: string; text: string }>;
	expect(JSON.parse(content[0]?.text ?? "")).toMatchObject({ id: "e1" });
	expect(result.isError).toBeFalsy();
});

it("maps api errors to tool errors", async () => {
	const { stub } = makeStub();
	(stub as { listProjects: unknown }).listProjects = () =>
		Promise.reject(
			new SpantailApiError(403, "insufficient_scope", "needs read"),
		);
	const client = await connect(stub);

	const result = await client.callTool({
		name: "list_projects",
		arguments: { workspaceId: "ws1" },
	});

	expect(result.isError).toBe(true);
	const content = result.content as Array<{ type: string; text: string }>;
	expect(content[0]?.text).toContain("insufficient_scope");
});

it("deletes an entry and reports the id", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	const result = await client.callTool({
		name: "delete_entry",
		arguments: { id: "e1" },
	});

	expect(calls.at(-1)).toEqual({ method: "deleteWorkEntry", args: ["e1"] });
	const content = result.content as Array<{ type: string; text: string }>;
	expect(JSON.parse(content[0]?.text ?? "")).toEqual({ deleted: "e1" });
});

it("creates a report adopting the suggested name", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	const result = await client.callTool({
		name: "create_report",
		arguments: {
			templateId: "tmpl-1",
			workspaceId: "ws1",
			dateRangePreset: "last_week",
			tags: ["infra"],
		},
	});

	expect(result.isError).toBeFalsy();
	expect(calls.map((call) => call.method)).toEqual([
		"previewReport",
		"createReport",
	]);
	expect(calls.at(-1)?.args[0]).toEqual({
		name: "Weekly 2026-06-08",
		templateId: "tmpl-1",
		filters: {
			workspaceIds: ["ws1"],
			projectIds: undefined,
			userIds: undefined,
			tags: ["infra"],
			dateRange: "last_week",
		},
		note: undefined,
	});
});

it("creates a report with an explicit name and note without previewing", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	await client.callTool({
		name: "create_report",
		arguments: {
			templateId: "tmpl-1",
			name: "June",
			note: "hand-written",
			from: "2026-06-01",
			to: "2026-06-30",
		},
	});

	expect(calls.map((call) => call.method)).toEqual(["createReport"]);
	expect(calls.at(-1)?.args[0]).toMatchObject({
		name: "June",
		note: "hand-written",
		filters: {
			workspaceIds: [],
			dateRange: { from: "2026-06-01", to: "2026-06-30" },
		},
	});
});

it("adopts the suggested note even when the name is explicit", async () => {
	const { stub, calls } = makeStub();
	(stub as { previewReport: unknown }).previewReport = () =>
		Promise.resolve({
			content: "# Preview",
			totalMinutes: 60,
			entryCount: 1,
			projectCount: 1,
			suggestedName: "Weekly 2026-06-08",
			suggestedNote: "Covers the week",
		});
	const client = await connect(stub);

	await client.callTool({
		name: "create_report",
		arguments: { templateId: "tmpl-1", name: "June", dateRangePreset: "today" },
	});

	expect(calls.at(-1)?.args[0]).toMatchObject({
		name: "June",
		note: "Covers the week",
	});
});

it("rejects a report scope without a period", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	const result = await client.callTool({
		name: "create_report",
		arguments: { templateId: "tmpl-1" },
	});

	expect(result.isError).toBe(true);
	const content = result.content as Array<{ type: string; text: string }>;
	expect(content[0]?.text).toContain("dateRangePreset or from and to");
	expect(calls.length).toBe(0);
});

it("previews a report without saving", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	const result = await client.callTool({
		name: "preview_report",
		arguments: { templateId: "tmpl-1", dateRangePreset: "today" },
	});

	expect(calls.map((call) => call.method)).toEqual(["previewReport"]);
	const content = result.content as Array<{ type: string; text: string }>;
	expect(JSON.parse(content[0]?.text ?? "")).toMatchObject({
		content: "# Preview",
		suggestedName: "Weekly 2026-06-08",
	});
});

it("updates a report by merging over the current one", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	await client.callTool({
		name: "update_report",
		arguments: { id: "r1", dateRangePreset: "this_month" },
	});

	expect(calls.map((call) => call.method)).toEqual([
		"getReport",
		"updateReport",
	]);
	expect(calls.at(-1)?.args).toEqual([
		"r1",
		{
			name: "Weekly",
			templateId: "tmpl-1",
			filters: {
				workspaceIds: ["ws1"],
				projectIds: undefined,
				userIds: undefined,
				tags: ["infra"],
				dateRange: "this_month",
			},
			note: undefined,
		},
	]);
});

it("drops an inherited project filter when the workspace changes", async () => {
	const { stub, calls } = makeStub();
	(stub as { getReport: unknown }).getReport = () =>
		Promise.resolve({
			id: "r1",
			name: "Weekly",
			templateId: "tmpl-1",
			note: null,
			filters: {
				workspaceIds: ["ws1"],
				projectIds: ["p1"],
				dateRange: { from: "2026-06-08", to: "2026-06-14" },
			},
		});
	const client = await connect(stub);

	await client.callTool({
		name: "update_report",
		arguments: { id: "r1", workspaceId: "ws2" },
	});

	expect(calls.at(-1)?.args[1]).toMatchObject({
		filters: { workspaceIds: ["ws2"], projectIds: undefined },
	});
});

it("switches a report to instance scope with allWorkspaces", async () => {
	const { stub, calls } = makeStub();
	(stub as { getReport: unknown }).getReport = () =>
		Promise.resolve({
			id: "r1",
			name: "Weekly",
			templateId: "tmpl-1",
			note: null,
			filters: {
				workspaceIds: ["ws1"],
				projectIds: ["p1"],
				dateRange: { from: "2026-06-08", to: "2026-06-14" },
			},
		});
	const client = await connect(stub);

	await client.callTool({
		name: "update_report",
		arguments: { id: "r1", allWorkspaces: true },
	});

	expect(calls.at(-1)?.args[1]).toMatchObject({
		filters: { workspaceIds: [], projectIds: undefined },
	});

	const conflict = await client.callTool({
		name: "update_report",
		arguments: { id: "r1", allWorkspaces: true, workspaceId: "ws2" },
	});
	expect(conflict.isError).toBe(true);
});

it("clears report filters with empty arrays", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	await client.callTool({
		name: "update_report",
		arguments: { id: "r1", tags: [] },
	});

	expect(calls.at(-1)?.args[1]).toMatchObject({
		filters: { tags: [], dateRange: { from: "2026-06-08", to: "2026-06-14" } },
	});
});

it("routes search to the api client", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	await client.callTool({ name: "search", arguments: { q: "build" } });

	expect(calls.at(-1)).toEqual({ method: "search", args: ["build"] });
});

it("rejects invalid tool input", async () => {
	const { stub, calls } = makeStub();
	const client = await connect(stub);

	const result = await client.callTool({
		name: "log_work",
		arguments: {
			workspaceId: "ws1",
			projectId: "p1",
			durationMinutes: -5,
			description: "x",
		},
	});

	expect(result.isError).toBe(true);
	expect(calls.some((call) => call.method === "createWorkEntry")).toBe(false);
});
