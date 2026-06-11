import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { WorkEntry } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { EntryForm } from "@/components/entry-form";
import { EntryList } from "@/components/entry-list";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/entries")({
	component: EntriesPage,
});

function EntriesPage() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const { session } = Route.useRouteContext();
	const [editing, setEditing] = useState<WorkEntry | null>(null);

	const workspaceId = current?.id;
	const projects = useQuery({
		queryKey: ["projects", workspaceId],
		queryFn: () => api.listProjects(workspaceId as string),
		enabled: Boolean(workspaceId),
	});
	const members = useQuery({
		queryKey: ["members", workspaceId],
		queryFn: () => api.listMembers(workspaceId as string),
		enabled: Boolean(workspaceId),
	});
	const entries = useQuery({
		queryKey: ["work-entries", workspaceId],
		queryFn: () => api.listWorkEntries({ workspaceId: workspaceId as string }),
		enabled: Boolean(workspaceId),
	});

	if (!current) {
		return (
			<p className="text-muted-foreground p-4 text-sm">
				{t("workspace.empty.title")}
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<h1 className="font-heading text-lg font-semibold">
				{t("entries.title")}
			</h1>
			<EntryForm
				workspaceId={current.id}
				projects={projects.data ?? []}
				editing={editing}
				onDone={() => setEditing(null)}
			/>
			{entries.isPending ? (
				<p className="text-muted-foreground p-4 text-center text-sm">
					{t("app.loading")}
				</p>
			) : (
				<EntryList
					workspaceId={current.id}
					entries={entries.data ?? []}
					projects={projects.data ?? []}
					members={members.data ?? []}
					currentUserId={session.user.id}
					onEdit={setEditing}
				/>
			)}
		</div>
	);
}
