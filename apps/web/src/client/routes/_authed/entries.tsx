import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { EntryList } from "@/components/entry-list";
import { useProjects } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/entries")({
	component: EntriesPage,
});

function EntriesPage() {
	const { t } = useTranslation();
	const { current } = useWorkspace();

	const workspaceId = current?.id;
	const projects = useProjects();
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
			{entries.isPending ? (
				<p className="text-muted-foreground p-4 text-center text-sm">
					{t("app.loading")}
				</p>
			) : (
				<EntryList
					entries={entries.data ?? []}
					projects={projects.data ?? []}
					members={members.data ?? []}
				/>
			)}
		</div>
	);
}
