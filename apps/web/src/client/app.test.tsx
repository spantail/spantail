import { createMemoryHistory } from "@tanstack/react-router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App, createAppRouter } from "./app";

const NOW = "2026-06-12T00:00:00.000Z";

const sessionPayload = {
	session: {
		id: "s1",
		token: "tok",
		userId: "u1",
		expiresAt: "2027-01-01T00:00:00.000Z",
	},
	user: {
		id: "u1",
		name: "Kato",
		email: "kato@example.com",
		emailVerified: false,
		isAdmin: true,
		createdAt: NOW,
		updatedAt: NOW,
	},
};

const mePayload = {
	user: { id: "u1", name: "Kato", email: "kato@example.com", isAdmin: true },
	memberships: [
		{
			id: "ws1",
			slug: "acme",
			name: "Acme",
			timezone: "Asia/Tokyo",
			settings: {},
			createdAt: NOW,
			archivedAt: null,
			role: "owner",
		},
	],
};

// The Better Auth client performs real HTTP through its own fetch wrapper;
// mock it at the module boundary. The API client late-binds globalThis.fetch,
// so the fetch stub below covers /api/v1/*.
const getSession = vi.fn();
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		getSession: () => getSession(),
		signOut: vi.fn(),
		signIn: { email: vi.fn() },
		signUp: { email: vi.fn() },
	},
}));

function json(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
	});
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input instanceof Request ? input.url : input));
			switch (url.pathname) {
				case "/api/v1/me":
					return json(mePayload);
				default:
					return json([]);
			}
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function renderApp(initialPath: string) {
	const router = createAppRouter({
		history: createMemoryHistory({ initialEntries: [initialPath] }),
	});
	render(<App router={router} />);
	return router;
}

it("redirects anonymous visitors to the login screen", async () => {
	getSession.mockResolvedValue({ data: null });
	const router = await renderApp("/");

	expect(await screen.findByRole("button", { name: "Log in" })).toBeDefined();
	expect(await screen.findByLabelText("Email")).toBeDefined();
	expect(router.state.location.pathname).toBe("/login");
});

it("opens the log-work dialog with the c shortcut", async () => {
	getSession.mockResolvedValue({ data: sessionPayload });
	await renderApp("/");
	await screen.findAllByText("Acme");

	// Modified keypresses are left alone (e.g. browser shortcuts).
	fireEvent.keyDown(window, { key: "c", metaKey: true });
	expect(screen.queryByRole("dialog")).toBeNull();

	fireEvent.keyDown(window, { key: "c" });
	const dialog = await screen.findByRole("dialog");
	expect(within(dialog).getByText("Log work")).toBeDefined();

	// A second press while the dialog is open must not stack another one.
	fireEvent.keyDown(window, { key: "c" });
	expect(screen.getAllByRole("dialog")).toHaveLength(1);
});

it("renders the authed shell with sidebar for a session", async () => {
	getSession.mockResolvedValue({ data: sessionPayload });
	await renderApp("/");

	// The workspace switcher shows the membership; the nav renders
	// tooltip-enabled sidebar buttons, so this catches missing providers.
	// "Reports" only exists in the header's user-scoped zone.
	expect((await screen.findAllByText("Acme")).length).toBeGreaterThan(0);
	expect((await screen.findAllByText("Entries")).length).toBeGreaterThan(0);
	expect((await screen.findAllByText("Reports")).length).toBeGreaterThan(0);
});
