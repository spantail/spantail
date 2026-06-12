import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { runCli } from "./cli";
import { createTestContext } from "./test-helpers";

it("prints usage on stdout for bare and --help invocations", async () => {
	for (const argv of [[], ["--help"], ["-h"]]) {
		const { ctx, stdout, stderr } = createTestContext();
		expect(await runCli(argv, ctx)).toBe(0);
		expect(stdout.text()).toContain("Usage: toxil <command>");
		expect(stderr.text()).toBe("");
	}
});

it("prints the package.json version", async () => {
	const pkg = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	) as { version: string };
	const { ctx, stdout } = createTestContext();
	expect(await runCli(["--version"], ctx)).toBe(0);
	expect(stdout.text()).toBe(`${pkg.version}\n`);
});

it("rejects unknown commands with usage on stderr", async () => {
	const { ctx, stdout, stderr } = createTestContext();
	expect(await runCli(["frobnicate"], ctx)).toBe(2);
	expect(stdout.text()).toBe("");
	expect(stderr.text()).toContain('unknown command "frobnicate"');
	expect(stderr.text()).toContain("Usage: toxil <command>");
});

it("prints command help for mcp --help", async () => {
	const { ctx, stdout } = createTestContext();
	expect(await runCli(["mcp", "--help"], ctx)).toBe(0);
	expect(stdout.text()).toContain("Usage: toxil mcp");
});

it("maps unknown flags to a usage error", async () => {
	const { ctx, stderr } = createTestContext();
	expect(await runCli(["mcp", "--bogus"], ctx)).toBe(2);
	expect(stderr.text()).toContain("--bogus");
	expect(stderr.text()).toContain("toxil mcp --help");
});

it("fails mcp without credentials", async () => {
	const { ctx, stderr } = createTestContext();
	expect(await runCli(["mcp"], ctx)).toBe(1);
	expect(stderr.text()).toContain("TOXIL_API_URL and TOXIL_API_TOKEN");
	expect(stderr.text()).toContain("toxil auth login");
});
