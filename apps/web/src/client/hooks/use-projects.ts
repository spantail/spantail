import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

/** Projects of the current workspace, deduped across sidebar/dialog/pages. */
export function useProjects() {
	const { current } = useWorkspace();
	const workspaceId = current?.id;
	return useQuery({
		queryKey: ["projects", workspaceId],
		queryFn: () => api.listProjects(workspaceId as string),
		enabled: Boolean(workspaceId),
	});
}
