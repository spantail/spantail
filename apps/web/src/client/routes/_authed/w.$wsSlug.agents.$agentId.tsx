import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/lib/document-title";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/w/$wsSlug/agents/$agentId")({
	component: AgentPage,
});

function AgentPage() {
	const { t } = useTranslation();
	const { agentId } = Route.useParams();
	const { current } = useWorkspace();
	const workspaceId = current?.id;

	// The agent's name/type come from the workspace-activity list (same query the
	// sidebar loads); an agent with no activity here simply isn't found.
	const agents = useQuery({
		queryKey: ["workspace-agents", workspaceId],
		queryFn: () => api.listWorkspaceAgents(workspaceId as string),
		enabled: Boolean(workspaceId),
	});
	const agent = (agents.data ?? []).find((a) => a.id === agentId);

	useDocumentTitle(
		agent && current ? `${agent.name} | ${current.name}` : undefined,
	);

	const stats = useQuery({
		queryKey: ["agent-entry-stats", workspaceId, agentId],
		queryFn: () =>
			api.getAgentEntryStats({ workspaceId: workspaceId as string, agentId }),
		enabled: Boolean(workspaceId),
	});

	const entries = useQuery({
		queryKey: ["agent-entries", workspaceId, agentId],
		queryFn: () =>
			api.listAgentEntries({
				workspaceId: workspaceId as string,
				agentId,
				limit: 100,
			}),
		enabled: Boolean(workspaceId),
	});

	if (!current) {
		return (
			<p className="text-muted-foreground p-4 text-sm">
				{t("workspace.empty.title")}
			</p>
		);
	}
	if (agents.isPending) {
		return (
			<p className="text-muted-foreground p-4 text-center text-sm">
				{t("app.loading")}
			</p>
		);
	}
	if (!agent) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
				<p className="text-muted-foreground text-sm">{t("agents.notFound")}</p>
				<Button asChild variant="outline">
					<Link to="/">{t("agents.backHome")}</Link>
				</Button>
			</div>
		);
	}

	const list = entries.data ?? [];
	const tiles = [
		{ key: "entryCount", value: stats.data?.entryCount ?? 0 },
		{ key: "totalMinutes", value: stats.data?.totalMinutes ?? 0 },
		{ key: "totalTokens", value: stats.data?.totalTokens ?? 0 },
	] as const;

	return (
		<div className="flex flex-col gap-7">
			<div className="flex items-center gap-2">
				<h1 className="font-heading text-xl font-semibold tracking-tight">
					{agent.name}
				</h1>
				<Badge variant="secondary">
					{t(`settings.agents.types.${agent.type}`)}
				</Badge>
			</div>

			<div className="grid grid-cols-3 gap-3">
				{tiles.map((tile) => (
					<div key={tile.key} className="rounded-lg border p-4">
						<p className="text-muted-foreground text-xs uppercase tracking-wider">
							{t(`agents.${tile.key}`)}
						</p>
						<p className="font-heading mt-1 text-2xl font-semibold tabular-nums">
							{tile.value.toLocaleString()}
						</p>
					</div>
				))}
			</div>

			<section className="flex flex-col gap-3">
				<h2 className="font-heading text-lg font-semibold">
					{t("agents.entriesTitle")}
				</h2>
				{entries.isPending ? (
					<p className="text-muted-foreground p-4 text-center text-sm">
						{t("app.loading")}
					</p>
				) : list.length === 0 ? (
					<p className="text-muted-foreground p-4 text-center text-sm">
						{t("agents.empty")}
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("agents.table.date")}</TableHead>
								<TableHead>{t("agents.table.duration")}</TableHead>
								<TableHead>{t("agents.table.tokens")}</TableHead>
								<TableHead>{t("agents.table.model")}</TableHead>
								<TableHead>{t("agents.table.description")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{list.map((entry) => (
								<TableRow key={entry.id}>
									<TableCell className="whitespace-nowrap">
										{entry.entryDate}
									</TableCell>
									<TableCell className="tabular-nums">
										{entry.durationMinutes}m
									</TableCell>
									<TableCell className="tabular-nums">
										{entry.usage?.totalTokens?.toLocaleString() ?? "—"}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{entry.usage?.model ?? "—"}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{entry.description ?? "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</section>
		</div>
	);
}
