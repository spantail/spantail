import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpantailClient } from "@spantail/sdk";
import { expect, it } from "vitest";

import { registerStdioTools } from "./mcp-tools";
import { fakeApi, projectFixture, workspaceFixture } from "./test-helpers";

const acme = workspaceFixture("acme", "owner");
const apiProject = projectFixture("api", acme.id);

async function connect(fetchImpl: typeof fetch) {
	const server = new McpServer({ name: "spantail-test", version: "0.0.0" });
	registerStdioTools(
		server,
		new SpantailClient({
			baseUrl: "https://spantail.example.com",
			token: "spantail_pat_test",
			client: "mcp",
			fetch: fetchImpl,
		}),
	);
	const mcpClient = new Client({ name: "test-client", version: "0.0.0" });
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await Promise.all([
		server.connect(serverTransport),
		mcpClient.connect(clientTransport),
	]);
	return mcpClient;
}

it("imports a JSONL file through the REST client and returns a summary", async () => {
	const stub = fakeApi([
		{ path: "/workspaces", body: [acme] },
		{ path: `/workspaces/${acme.id}/projects`, body: [apiProject] },
		{
			method: "POST",
			path: "/work-entries/batch",
			status: 201,
			body: { count: 2 },
		},
	]);
	const client = await connect(stub.fetch);

	const dir = mkdtempSync(path.join(os.tmpdir(), "spantail-mcp-import-"));
	const file = path.join(dir, "entries.jsonl");
	writeFileSync(
		file,
		[
			'{"project":"api","entryDate":"2026-06-01","durationMinutes":60,"description":"a","externalId":"legacy-1"}',
			'{"entryDate":"2026-06-02","durationMinutes":30,"description":"b"}',
		].join("\n"),
	);

	const result = await client.callTool({
		name: "import_work_entries",
		arguments: { file, workspace: "acme", project: "api" },
	});

	expect(result.isError).toBeFalsy();
	const content = result.content as Array<{ type: string; text: string }>;
	expect(JSON.parse(content[0]?.text ?? "")).toEqual({
		imported: 2,
		requests: 1,
		workspace: "acme",
	});
	const post = stub.calls.find((call) => call.method === "POST");
	expect((post?.body as { entries: unknown[] }).entries).toHaveLength(2);
});

it("surfaces filesystem errors as tool errors", async () => {
	const stub = fakeApi([{ path: "/workspaces", body: [acme] }]);
	const client = await connect(stub.fetch);

	const result = await client.callTool({
		name: "import_work_entries",
		arguments: { file: "/nope/entries.jsonl", workspace: "acme" },
	});
	expect(result.isError).toBe(true);
	const content = result.content as Array<{ type: string; text: string }>;
	expect(content[0]?.text).toContain("ENOENT");
});
