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
		listReportTemplates: record("listReportTemplates", [{ id: "tmpl-1" }]),
		listReports: record("listReports", [{ id: "r1" }]),
		getReport: record("getReport", { id: "r1", renderedMarkdown: "# Report" }),
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

it("exposes the eight spantail tools", async () => {
	const { stub } = makeStub();
	const client = await connect(stub);

	const { tools } = await client.listTools();
	expect(tools.map((tool) => tool.name).sort()).toEqual([
		"get_report",
		"list_entries",
		"list_projects",
		"list_report_templates",
		"list_reports",
		"list_workspaces",
		"log_work",
		"update_entry",
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
