import { cn } from "@/lib/utils";
import { initials } from "./person-avatar";

/**
 * Square workspace icon: the uploaded logo when set, otherwise the workspace
 * name's initials on the accent swatch. Shared by the sidebar workspace
 * switcher and the General settings preview so both stay in sync.
 */
export function WorkspaceAvatar({
	name,
	logoUrl,
	className,
}: {
	name: string;
	logoUrl?: string | null;
	className?: string;
}) {
	if (logoUrl) {
		return (
			<img
				src={logoUrl}
				alt=""
				className={cn("aspect-square rounded-lg object-cover", className)}
			/>
		);
	}
	return (
		<div
			aria-hidden
			className={cn(
				"flex aspect-square items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground",
				className,
			)}
		>
			{initials(name)}
		</div>
	);
}
