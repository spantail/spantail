import type { WorkEntry } from "@spantail/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { useEntryRowNav } from "./use-entry-row-nav";

// Mock the entry dialog so we control the panel selection (viewEntryId) and can
// observe openView/registerEntries. `state.viewEntryId` is read on every render.
const { openView, registerEntries, state } = vi.hoisted(() => ({
	openView: vi.fn(),
	registerEntries: vi.fn(),
	state: { viewEntryId: null as string | null },
}));
vi.mock("@/components/entry-dialog", () => ({
	useEntryDialog: () => ({
		openView,
		viewEntryId: state.viewEntryId,
		registerEntries,
	}),
}));

afterEach(() => {
	cleanup();
	openView.mockClear();
	registerEntries.mockClear();
	state.viewEntryId = null;
});

const entries = [
	{ id: "a" },
	{ id: "b" },
	{ id: "c" },
] as unknown as WorkEntry[];

function Harness() {
	const containerRef = useRef<HTMLUListElement>(null);
	const { activeIndex } = useEntryRowNav(entries, containerRef);
	return (
		<ul ref={containerRef} data-testid="list" data-active={activeIndex}>
			{entries.map((e, i) => (
				<li key={e.id} data-nav-index={i}>
					{e.id}
				</li>
			))}
		</ul>
	);
}

const active = (c: HTMLElement) =>
	c.querySelector("[data-testid=list]")?.getAttribute("data-active");

it("registers its entries with the panel", () => {
	render(<Harness />);
	expect(registerEntries).toHaveBeenCalledWith(entries);
});

it("moves a local highlight with j/k and opens with o while the panel is closed", () => {
	const { container } = render(<Harness />);
	fireEvent.keyDown(window, { key: "j" });
	expect(active(container)).toBe("0");
	fireEvent.keyDown(window, { key: "j" });
	expect(active(container)).toBe("1");
	fireEvent.keyDown(window, { key: "o" });
	expect(openView).toHaveBeenCalledWith(entries[1]);
});

it("ignores the arrow keys while the panel isn't driving this list", () => {
	const { container } = render(<Harness />);
	fireEvent.keyDown(window, { key: "ArrowDown" });
	expect(active(container)).toBe("-1");
	expect(openView).not.toHaveBeenCalled();
});

it("follows the panel selection and moves it with the arrows when the entry is in this list", () => {
	state.viewEntryId = "b";
	const { container } = render(<Harness />);
	// The highlight tracks the panel's entry (index of "b"), not local state.
	expect(active(container)).toBe("1");
	fireEvent.keyDown(window, { key: "ArrowDown" });
	expect(openView).toHaveBeenCalledWith(entries[2]);
});

it("keeps its own highlight when the panel shows an entry not in this list", () => {
	state.viewEntryId = "zzz";
	const { container } = render(<Harness />);
	expect(active(container)).toBe("-1");
	// Arrows are gated off (they scroll the page), but j still highlights locally.
	fireEvent.keyDown(window, { key: "ArrowDown" });
	expect(active(container)).toBe("-1");
	fireEvent.keyDown(window, { key: "j" });
	expect(active(container)).toBe("0");
	expect(openView).not.toHaveBeenCalled();
});
