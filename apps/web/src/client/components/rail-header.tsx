import { Link } from "@tanstack/react-router";
import { XIcon } from "lucide-react";

import { SidebarHeader, useSidebar } from "@/components/ui/sidebar";

/**
 * Header for the full-screen takeover rails (Reports / Messages). The rail
 * replaces the workspace navigation, so this carries the screen title plus a
 * bordered Close button that returns to the workspace home. When the rail
 * collapses to icons, the title and label drop away and only the X remains.
 */
export function RailHeader({
	title,
	closeLabel,
}: {
	title: string;
	closeLabel: string;
}) {
	const { setOpenMobile } = useSidebar();
	return (
		<SidebarHeader className="h-[72px] flex-row items-center justify-between px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
			<span className="font-heading truncate text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
				{title}
			</span>
			<Link
				to="/"
				aria-label={closeLabel}
				title={closeLabel}
				onClick={() => setOpenMobile(false)}
				className="hover:bg-accent hover:text-accent-foreground bg-background text-muted-foreground flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-sm transition-colors"
			>
				<XIcon className="size-3.5" />
				<span className="group-data-[collapsible=icon]:hidden">
					{closeLabel}
				</span>
			</Link>
		</SidebarHeader>
	);
}
