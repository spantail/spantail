import type { Me } from "@spantail/sdk";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { useRealtimeSync } from "@/lib/realtime";
import { WorkspaceProvider } from "@/lib/workspace";

/**
 * Loads the current user and provides workspace context. Shared by the two
 * authenticated shells — the workspace chrome (`_authed`) and the mailbox
 * (`/messages`) — so the `me` query and WorkspaceProvider live in one place. Each
 * shell still declares its own route-level auth guard (a tiny session check).
 */
export function AuthedRoot({
	children,
}: {
	children: (me: Me) => React.ReactNode;
}) {
	const { t } = useTranslation();
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
	// One SSE connection for the whole authenticated app; pushes invalidations so
	// changes from other users, the CLI, MCP, and agent ingest surface live.
	useRealtimeSync();

	if (me.isPending) {
		return (
			<div className="flex min-h-svh items-center justify-center">
				<p className="text-muted-foreground">{t("app.loading")}</p>
			</div>
		);
	}
	if (me.isError || !me.data) {
		return (
			<div className="flex min-h-svh items-center justify-center">
				<p className="text-destructive">{t("errors.generic")}</p>
			</div>
		);
	}

	return (
		<WorkspaceProvider workspaces={me.data.memberships}>
			{children(me.data)}
		</WorkspaceProvider>
	);
}
