import { Avatar as AvatarPrimitive } from "radix-ui";

import { hueFromString } from "@/lib/hue";
import { cn } from "@/lib/utils";

/** Up to two uppercase initials from a display name. */
export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

/**
 * Round avatar for a person. Shows their uploaded/linked image when `imageUrl`
 * is given, falling back (on absence or load error) to initials over a stable
 * per-name hue — the same fallback used wherever a person has no avatar.
 */
export function PersonAvatar({
	name,
	imageUrl,
	size = 36,
	className,
}: {
	name: string;
	imageUrl?: string | null;
	size?: number;
	className?: string;
}) {
	const hue = hueFromString(name);
	return (
		<AvatarPrimitive.Root
			aria-hidden
			className={cn("flex shrink-0 overflow-hidden rounded-full", className)}
			style={{ width: size, height: size }}
		>
			{imageUrl ? (
				<AvatarPrimitive.Image
					src={imageUrl}
					alt=""
					className="aspect-square size-full object-cover"
				/>
			) : null}
			<AvatarPrimitive.Fallback
				// Initials show immediately without an image; a brief delay when there
				// is one avoids a flash before it loads.
				delayMs={imageUrl ? 300 : 0}
				className="flex size-full items-center justify-center font-semibold text-white"
				style={{
					fontSize: size * 0.36,
					background: `oklch(0.62 0.13 ${hue})`,
				}}
			>
				{initials(name)}
			</AvatarPrimitive.Fallback>
		</AvatarPrimitive.Root>
	);
}
