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

const zeroStats = {
	totalMinutes: 0,
	entryCount: 0,
	byDate: [],
	byProject: [],
	byUser: [],
};

const projectPayload = {
	slug: "website",
	name: "Website",
	description: null,
	status: "active",
	createdAt: NOW,
	archivedAt: null,
};

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input instanceof Request ? input.url : input));
			switch (url.pathname) {
				case "/api/v1/me":
					return json(mePayload);
				case "/api/v1/work-entries/stats":
					return json(zeroStats);
				case "/api/v1/workspaces/ws1/projects":
					return json([{ ...projectPayload, id: "p1", workspaceId: "ws1" }]);
				default:
					return json([]);
			}
		}),
	);
	// happy-dom has no IntersectionObserver; the timeline sentinel needs one.
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
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
	expect(
		within(dialog).getByRole("heading", { name: "Log work" }),
	).toBeDefined();

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
	expect((await screen.findAllByText("Reports")).length).toBeGreaterThan(0);
	expect((await screen.findAllByText("Projects")).length).toBeGreaterThan(0);
	expect(await screen.findByRole("button", { name: "Log work" })).toBeDefined();
});

it("redirects the removed entries route to home", async () => {
	getSession.mockResolvedValue({ data: sessionPayload });
	const router = await renderApp("/entries");

	// `/entries` → `/` → the active workspace dashboard.
	expect(await screen.findByText("Today")).toBeDefined();
	expect(router.state.location.pathname).toBe("/w/acme");
});

it("redirects the bare home route to the active workspace dashboard", async () => {
	getSession.mockResolvedValue({ data: sessionPayload });
	const router = await renderApp("/");

	expect(await screen.findByText("Today")).toBeDefined();
	expect(router.state.location.pathname).toBe("/w/acme");
});

it("renders a project page addressed by its slug", async () => {
	getSession.mockResolvedValue({ data: sessionPayload });
	const router = await renderApp("/w/acme/projects/website");

	expect((await screen.findAllByText("Website")).length).toBeGreaterThan(0);
	expect(router.state.location.pathname).toBe("/w/acme/projects/website");
});

it("pre-selects the project when logging work from a project page", async () => {
	getSession.mockResolvedValue({ data: sessionPayload });
	await renderApp("/w/acme/projects/website");
	// Wait for the projects query so the contextual default can resolve.
	await screen.findAllByText("Website");

	fireEvent.keyDown(window, { key: "c" });
	const dialog = await screen.findByRole("dialog");
	// Matches the select's rendered value (and its hidden native option).
	expect(
		(await within(dialog).findAllByText("Website")).length,
	).toBeGreaterThan(0);
});

it("shows a not-found message for an unknown project slug", async () => {
	getSession.mockResolvedValue({ data: sessionPayload });
	await renderApp("/w/acme/projects/ghost");

	expect(
		await screen.findByText("Project not found in this workspace."),
	).toBeDefined();
});

it("redirects an unknown workspace slug to the active workspace", async () => {
	getSession.mockResolvedValue({ data: sessionPayload });
	const router = await renderApp("/w/ghost");

	expect(await screen.findByText("Today")).toBeDefined();
	expect(router.state.location.pathname).toBe("/w/acme");
});

it("renders the home dashboard and the empty timeline call to action", async () => {
	getSession.mockResolvedValue({ data: sessionPayload });
	await renderApp("/");

	expect(await screen.findByText("Today")).toBeDefined();
	expect(await screen.findByText("This month")).toBeDefined();
	expect(
		await screen.findByRole("button", { name: "Log your first entry" }),
	).toBeDefined();
});
