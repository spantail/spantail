import { afterEach, describe, expect, it } from "vitest";

import { checkForUpdate, setUpdateCheckFetchForTests } from "./update-check";

afterEach(() => setUpdateCheckFetchForTests(null));

describe("checkForUpdate", () => {
	const jsonTag = (tag: string) =>
		new Response(JSON.stringify({ tag_name: tag }), {
			headers: { "content-type": "application/json" },
		});

	it("reports an available update when upstream is newer", async () => {
		setUpdateCheckFetchForTests(async () => jsonTag("v9.9.9"));
		expect(await checkForUpdate("v0.1.0")).toEqual({
			current: "v0.1.0",
			latest: "v9.9.9",
			updateAvailable: true,
		});
	});

	it("reports no update when already current", async () => {
		setUpdateCheckFetchForTests(async () => jsonTag("v0.1.0"));
		expect(await checkForUpdate("v0.1.0")).toEqual({
			current: "v0.1.0",
			latest: "v0.1.0",
			updateAvailable: false,
		});
	});

	it("passes the tag through but never prompts an off-tag build", async () => {
		setUpdateCheckFetchForTests(async () => jsonTag("v9.9.9"));
		const result = await checkForUpdate("v0.1.0-7-gabc");
		expect(result.latest).toBe("v9.9.9");
		expect(result.updateAvailable).toBe(false);
	});

	it("reports no update on a non-ok response", async () => {
		setUpdateCheckFetchForTests(async () => new Response("", { status: 503 }));
		expect(await checkForUpdate("v0.1.0")).toEqual({
			current: "v0.1.0",
			latest: null,
			updateAvailable: false,
		});
	});

	it("reports no update when the check throws (offline / blocked)", async () => {
		setUpdateCheckFetchForTests(async () => {
			throw new Error("network down");
		});
		expect(await checkForUpdate("v0.1.0")).toEqual({
			current: "v0.1.0",
			latest: null,
			updateAvailable: false,
		});
	});
});
