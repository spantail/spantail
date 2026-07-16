// Product-tour scenario: walks the demo dataset end to end as Alice —
// log in, browse work entries (detail panel + `j` keyboard navigation),
// browse agent sessions, log a work entry from two selected sessions (`c`),
// compose yesterday's daily report (entries + agent activity), create a
// share link, send the report to a teammate and to her own inbox, then
// review a teammate's report with a reaction and a comment.
//
// Written for recording product demos (e.g. with a screen/interaction
// recorder running) or as a scripted walkthrough of the seeded world, so
// every interaction is paced for a viewer, not for speed.
//
// Prerequisites:
//   pnpm db:reset && pnpm db:seed   # deterministic demo data + passwords
//   pnpm dev                        # http://localhost:5173
// The browser profile should be logged out; the UI language follows
// localStorage["spantail.lang"] (set it to "en" for an English run).
//
// The file is a single `async (page) => { ... }` Playwright function
// expression: pass it to a runner that invokes it with a Playwright `page`
// (e.g. the Playwright MCP `browser_run_code` tool with this file's path).
// The credentials below are the seeded demo user's; the password is
// deterministic (printed by `pnpm db:seed`) and not a secret.

async (page) => {
	const EMAIL = "alice@northwind.example";
	const PASSWORD = "Spantail-Alice-r4ln8r";
	const BASE = "http://localhost:5173";

	// The seed derives all activity from the current date, so the literals
	// below match the seeded world only relative to the day you run this
	// (this scenario was captured on Thu 2026-07-16). Before a run, adjust:
	// - FIRST_ENTRY: the description of today's first timeline entry
	// - FIRST_SESSION: the description of the agent's newest titled session
	// - SESSION_ROW_1/2: two sessions from yesterday that share a project
	//   (mixed-project selections can't be combined) — run on Tue-Fri so
	//   "yesterday" is a weekday with data
	// - REPORT_DAY: yesterday's date (matches the teammate report opened last)
	const FIRST_ENTRY = "Added a migration linter to CI";
	const FIRST_SESSION = "Triaged inbound bug reports";
	const SESSION_ROW_1 = /Wed, Jul 15 16:30/;
	const SESSION_ROW_2 = /Wed, Jul 15 09:30/;
	const REPORT_DAY = "2026-07-15";

	// Scene 1: log in
	await page.goto(`${BASE}/login`);
	const email = page.getByRole("textbox", { name: "Email" });
	await email.click();
	await email.pressSequentially(EMAIL, { delay: 35 });
	await page.waitForTimeout(250);
	const pw = page.getByRole("textbox", { name: "Password" });
	await pw.click();
	await pw.pressSequentially(PASSWORD, { delay: 30 });
	await page.waitForTimeout(350);
	await page.getByRole("button", { name: "Log in" }).click();
	await page.waitForURL("**/w/northwind");
	await page.waitForTimeout(1500);

	// Scene 2-3: Home timeline — open an entry, flow through the list with `j`
	await page.mouse.move(800, 450);
	await page.mouse.wheel(0, 500);
	await page.waitForTimeout(500);
	await page.mouse.wheel(0, 450);
	await page.waitForTimeout(700);
	await page.getByRole("button", { name: FIRST_ENTRY }).first().click();
	await page.waitForTimeout(1300);
	for (let i = 0; i < 5; i++) {
		await page.keyboard.press("j");
		await page.waitForTimeout(450);
	}
	await page.waitForTimeout(500);
	await page.keyboard.press("Escape");
	await page.waitForTimeout(400);

	// Scene 4: My Claude Code — open a session, flow with `j`
	await page.getByRole("link", { name: "My Claude Code" }).click();
	await page.waitForTimeout(1600);
	await page.mouse.move(800, 450);
	await page.mouse.wheel(0, 450);
	await page.waitForTimeout(600);
	await page.getByRole("button", { name: FIRST_SESSION }).first().click();
	await page.waitForTimeout(1300);
	for (let i = 0; i < 4; i++) {
		await page.keyboard.press("j");
		await page.waitForTimeout(450);
	}
	await page.waitForTimeout(500);
	await page.keyboard.press("Escape");
	await page.waitForTimeout(600);

	// Scene 5: select two same-project sessions from yesterday, log work via `c`
	await page
		.getByRole("row", { name: SESSION_ROW_1 })
		.getByRole("checkbox")
		.click();
	await page.waitForTimeout(600);
	await page
		.getByRole("row", { name: SESSION_ROW_2 })
		.getByRole("checkbox")
		.click();
	await page.waitForTimeout(800);
	await page.keyboard.press("c");
	await page.waitForTimeout(1100);
	const entryDialog = page.getByRole("dialog");
	const desc = entryDialog.getByRole("textbox", { name: "Description" });
	await desc.click();
	await desc.pressSequentially("Added a migration linter to CI", {
		delay: 30,
	});
	await page.waitForTimeout(600);
	await entryDialog.getByRole("button", { name: "Log work" }).click();
	await page.waitForTimeout(1300);

	// Scene 6: compose yesterday's daily report (entries + agent activity)
	await page.getByRole("link", { name: "Reports" }).click();
	await page.waitForTimeout(1500);
	await page.getByRole("button", { name: "New report", exact: true }).click();
	await page.waitForTimeout(1300);
	const dialog = page.getByRole("dialog");
	await dialog
		.getByRole("combobox")
		.filter({ hasText: "No workspace" })
		.click();
	await page.waitForTimeout(600);
	await page.getByRole("option", { name: "Northwind Software" }).click();
	await page.waitForTimeout(800);
	await dialog.getByRole("button", { name: "Date range" }).click();
	await page.waitForTimeout(600);
	await page.getByRole("button", { name: "Yesterday" }).click();
	await page.waitForTimeout(900);
	const note = dialog.getByRole("textbox", { name: "Note" });
	await note.click();
	await note.pressSequentially(
		"Focus of the day: the CI migration linter. Claude Code did the groundwork in two short sessions — see Agent activity below.",
		{ delay: 18 },
	);
	await page.waitForTimeout(1800);
	await dialog.getByRole("button", { name: "Create report" }).click();
	await page.waitForTimeout(1800);

	// Scene 7: create and copy a share link
	await page.getByRole("button", { name: "Share" }).click();
	await page.waitForTimeout(1100);
	const shareDialog = page.getByRole("dialog");
	await shareDialog.getByRole("button", { name: "Create share link" }).click();
	await page.waitForTimeout(1300);
	await shareDialog.getByRole("button", { name: "Copy URL" }).click();
	await page.waitForTimeout(1100);
	await page.keyboard.press("Escape");
	await page.waitForTimeout(700);

	// Scene 8: send to Carol and to Alice's own inbox
	await page.getByRole("button", { name: "Send to" }).click();
	await page.waitForTimeout(1100);
	const sendDialog = page.getByRole("dialog");
	await sendDialog.getByRole("button", { name: "Carol Mendoza" }).click();
	await page.waitForTimeout(700);
	await sendDialog
		.getByRole("checkbox", { name: /Also send to my inbox/ })
		.click();
	await page.waitForTimeout(700);
	const msg = sendDialog.getByRole("textbox", { name: "Message" });
	await msg.click();
	await msg.pressSequentially(
		"Hi Carol — yesterday's report, including the agent sessions behind the CI linter work. Have a look before tomorrow's standup.",
		{ delay: 16 },
	);
	await page.waitForTimeout(700);
	await sendDialog.getByRole("button", { name: /Send to 1 person/ }).click();
	await page.waitForTimeout(1400);

	// Scene 9: back to the workspace, open Messages, read the own copy
	await page.getByRole("button", { name: "Close" }).first().click();
	await page.waitForTimeout(1000);
	await page.getByRole("link", { name: "Close" }).click();
	await page.waitForTimeout(1300);
	await page.locator('a[href="/messages"]').first().click();
	await page.waitForTimeout(1400);
	await page
		.getByRole("link", { name: /Alice Nakamura/ })
		.first()
		.click();
	await page.waitForTimeout(2200);

	// Scene 10: review Carol's daily report — react and comment
	await page
		.getByRole("link", { name: /Carol Mendoza/ })
		.filter({ hasText: REPORT_DAY })
		.first()
		.click();
	await page.waitForTimeout(1700);
	const addReaction = page
		.getByRole("button", { name: "Add reaction" })
		.first();
	await addReaction.scrollIntoViewIfNeeded();
	await page.waitForTimeout(800);
	await addReaction.click();
	await page.waitForTimeout(700);
	await page.getByRole("button", { name: "Hooray" }).click();
	await page.waitForTimeout(900);
	const box = page.getByRole("textbox", { name: "Leave a comment…" });
	await box.click();
	await box.pressSequentially("Thanks for the detailed notes — solid day!", {
		delay: 25,
	});
	await page.waitForTimeout(600);
	await page.getByRole("button", { name: "Comment", exact: true }).click();
	await page.waitForTimeout(2200);

	return "product tour done";
};
