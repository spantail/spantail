import { XIcon } from "lucide-react";

/** Removable chip summarising one active filter, shown beneath the tab bar. */
export function FilterChip({
	label,
	removeLabel,
	onClear,
}: {
	label: string;
	removeLabel: string;
	onClear: () => void;
}) {
	return (
		<span className="border-border bg-muted/60 text-foreground inline-flex items-center gap-1 rounded-full border py-1 pr-1 pl-2.5 text-xs font-medium">
			{label}
			<button
				type="button"
				aria-label={removeLabel}
				onClick={onClear}
				className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex size-4 items-center justify-center rounded-full transition-colors"
			>
				<XIcon className="size-3" />
			</button>
		</span>
	);
}
