import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";

/**
 * Icon button that copies a string to the clipboard and briefly flips its icon
 * to a check. The accessible label is passed in so the button stays generic —
 * callers own the i18n.
 */
export function CopyButton({
	value,
	label,
	className,
}: {
	value: string;
	label: string;
	className?: string;
}) {
	const { copied, copy } = useCopy();

	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			aria-label={label}
			title={label}
			className={className}
			onClick={() => copy(value)}
		>
			{copied ? <CheckIcon /> : <CopyIcon />}
		</Button>
	);
}
