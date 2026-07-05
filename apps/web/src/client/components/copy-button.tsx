import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

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
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => () => clearTimeout(timer.current), []);

	const copy = async () => {
		await navigator.clipboard.writeText(value);
		setCopied(true);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), 1600);
	};

	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			aria-label={label}
			title={label}
			className={className}
			onClick={copy}
		>
			{copied ? <CheckIcon /> : <CopyIcon />}
		</Button>
	);
}
