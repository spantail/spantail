import { expect, it } from "vitest";

import i18n from "./index";

it("syncs document.documentElement.lang with the active language", async () => {
	await i18n.changeLanguage("ja");
	expect(document.documentElement.lang).toBe("ja");

	await i18n.changeLanguage("en");
	expect(document.documentElement.lang).toBe("en");
});

it("normalizes a regional navigator locale to a catalog language", async () => {
	await i18n.changeLanguage("ja-JP");
	expect(document.documentElement.lang).toBe("ja");
});
