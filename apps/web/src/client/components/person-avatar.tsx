import { hueFromString } from "@/lib/hue";
import { cn } from "@/lib/utils";

/** Up to two uppercase initials from a display name. */
function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

/**
 * Round initials avatar with a stable per-name hue — used wherever a person is
 * listed without an uploaded image (recipient picker, inbox senders).
 */
export function PersonAvatar({
	name,
	size = 36,
	className,
}: {
	name: string;
	size?: number;
	className?: string;
}) {
	const hue = hueFromString(name);
	return (
		<span
			aria-hidden
			className={cn(
				"flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
				className,
			)}
			style={{
				width: size,
				height: size,
				fontSize: size * 0.36,
				background: `oklch(0.62 0.13 ${hue})`,
			}}
		>
			{initials(name)}
		</span>
	);
}
