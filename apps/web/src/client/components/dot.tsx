import { projectColor } from "@/lib/hue";
import { cn } from "@/lib/utils";

/** Small filled circle in a stable hue — leads template rows in the rail/list
 *  and tags a report's single project. Decorative, so hidden from a11y. */
export function Dot({
	hue,
	size = 8,
	className,
}: {
	hue: number;
	size?: number;
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={cn("shrink-0 rounded-full", className)}
			style={{
				width: size,
				height: size,
				background: projectColor(hue),
			}}
		/>
	);
}
