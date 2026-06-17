import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

// User-scoped inbox bell in the header's top-right corner. The unread badge
// polls so a delivery from another user surfaces without a manual refresh.
export function NavInbox() {
	const { t } = useTranslation();
	const unread = useQuery({
		queryKey: ["inbox-unread"],
		queryFn: () => api.getInboxUnreadCount(),
		refetchInterval: 60_000,
	});
	const count = unread.data?.count ?? 0;

	return (
		<Button
			asChild
			variant="ghost"
			size="icon"
			className="relative rounded-full"
		>
			<Link
				to="/notifications"
				aria-label={t("notifications.title")}
				activeProps={{ className: "bg-accent text-accent-foreground" }}
			>
				<BellIcon />
				{count > 0 && (
					<span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
						{count > 99 ? "99+" : count}
					</span>
				)}
			</Link>
		</Button>
	);
}
