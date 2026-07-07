import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { useListKeyboardNav } from "./use-list-keyboard-nav";

afterEach(cleanup);

/** Drives the hook over a 3-item list with local selection (the entry-list
 *  shape), exposing the active index and the open/reach-end callbacks. */
function Harness({
	onOpen,
	onReachEnd,
	arrowKeys,
}: {
	onOpen?: () => void;
	onReachEnd?: () => void;
	arrowKeys?: boolean;
}) {
	const containerRef = useRef<HTMLUListElement>(null);
	const [active, setActive] = useState(-1);
	useListKeyboardNav({
		length: 3,
		index: active,
		onMove: setActive,
		onOpen,
		onReachEnd,
		containerRef,
		arrowKeys,
	});
	return (
		<ul ref={containerRef} data-testid="active" data-active={active}>
			{[0, 1, 2].map((i) => (
				<li key={i} data-nav-index={i}>
					row {i}
				</li>
			))}
		</ul>
	);
}

const activeIndex = (c: HTMLElement) =>
	c.querySelector("[data-testid=active]")?.getAttribute("data-active");

it("moves down with j and up with k", () => {
	const { container } = render(<Harness />);
	fireEvent.keyDown(window, { key: "j" });
	expect(activeIndex(container)).toBe("0");
	fireEvent.keyDown(window, { key: "j" });
	expect(activeIndex(container)).toBe("1");
	fireEvent.keyDown(window, { key: "k" });
	expect(activeIndex(container)).toBe("0");
});

it("opens the active item with o", () => {
	const onOpen = vi.fn();
	const { container } = render(<Harness onOpen={onOpen} />);
	// No selection yet: `o` is a no-op.
	fireEvent.keyDown(window, { key: "o" });
	expect(onOpen).not.toHaveBeenCalled();
	fireEvent.keyDown(window, { key: "j" });
	fireEvent.keyDown(window, { key: "o" });
	expect(onOpen).toHaveBeenCalledTimes(1);
	expect(activeIndex(container)).toBe("0");
});

it("fires onReachEnd when j is pressed at the last item", () => {
	const onReachEnd = vi.fn();
	render(<Harness onReachEnd={onReachEnd} />);
	fireEvent.keyDown(window, { key: "j" }); // 0
	fireEvent.keyDown(window, { key: "j" }); // 1
	fireEvent.keyDown(window, { key: "j" }); // 2 (last)
	expect(onReachEnd).not.toHaveBeenCalled();
	fireEvent.keyDown(window, { key: "j" }); // at last → reach end
	expect(onReachEnd).toHaveBeenCalledTimes(1);
});

it("ignores the arrow keys by default", () => {
	const { container } = render(<Harness />);
	fireEvent.keyDown(window, { key: "ArrowDown" });
	expect(activeIndex(container)).toBe("-1");
});

it("moves with the arrow keys when arrowKeys is on", () => {
	const { container } = render(<Harness arrowKeys />);
	fireEvent.keyDown(window, { key: "ArrowDown" });
	expect(activeIndex(container)).toBe("0");
	fireEvent.keyDown(window, { key: "ArrowDown" });
	expect(activeIndex(container)).toBe("1");
	fireEvent.keyDown(window, { key: "ArrowUp" });
	expect(activeIndex(container)).toBe("0");
});

it("ignores keys while typing in an input", () => {
	const { container } = render(
		<>
			<input data-testid="field" />
			<Harness />
		</>,
	);
	const input = container.querySelector(
		"[data-testid=field]",
	) as HTMLInputElement;
	fireEvent.keyDown(input, { key: "j" });
	expect(activeIndex(container)).toBe("-1");
});

it("ignores keys with modifiers and while a dialog is open", () => {
	const { container } = render(<Harness />);
	fireEvent.keyDown(window, { key: "j", metaKey: true });
	expect(activeIndex(container)).toBe("-1");

	const dialog = document.createElement("div");
	dialog.setAttribute("role", "dialog");
	document.body.appendChild(dialog);
	fireEvent.keyDown(window, { key: "j" });
	expect(activeIndex(container)).toBe("-1");
	document.body.removeChild(dialog);
});
