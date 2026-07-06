import type { GithubMapping } from "@spantail/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useSettingsWorkspace } from "@/lib/settings-workspace";

export const Route = createFileRoute("/settings/_workspace/integrations")({
	component: IntegrationsSection,
});

// Workspace-scoped GitHub repo → project mappings (issue #159): the single
// source of truth that resolves @spantail comments and #N log-work calls to
// a project. Managed by workspace admins; reading is open to members. The
// _workspace layout provides the section chrome and the workspaces pane.
function IntegrationsSection() {
	const { t } = useTranslation();
	const { selected, canManage } = useSettingsWorkspace();

	if (!selected) {
		return <p className="text-muted-foreground text-sm">{t("app.loading")}</p>;
	}
	return (
		<div key={selected.id} className="flex flex-col gap-4">
			<RepoMappingsCard workspaceId={selected.id} canManage={canManage} />
			{canManage && <UnmappedReposCard workspaceId={selected.id} />}
		</div>
	);
}

function RepoMappingsCard({
	workspaceId,
	canManage,
}: {
	workspaceId: string;
	canManage: boolean;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const mappings = useQuery({
		queryKey: ["github-mappings", workspaceId],
		queryFn: () => api.listGithubMappings(workspaceId),
	});
	const projects = useQuery({
		queryKey: ["projects", workspaceId],
		queryFn: () => api.listProjects(workspaceId),
	});

	const [repoFullName, setRepoFullName] = useState("");
	const [projectId, setProjectId] = useState("");

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: ["github-mappings", workspaceId],
		});
		await queryClient.invalidateQueries({
			queryKey: ["github-unmapped", workspaceId],
		});
	};

	const createMutation = useMutation({
		mutationFn: () =>
			api.createGithubMapping(workspaceId, {
				repoFullName: repoFullName.trim(),
				projectId,
			}),
		onSuccess: async () => {
			setRepoFullName("");
			toast.success(t("settings.integrations.mappings.added"));
			await invalidate();
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (mappingId: string) =>
			api.deleteGithubMapping(workspaceId, mappingId),
		onSuccess: async () => {
			toast.success(t("settings.integrations.mappings.removed"));
			await invalidate();
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const activeProjects = (projects.data ?? []).filter((p) => !p.archivedAt);
	const rows: GithubMapping[] = mappings.data ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.integrations.mappings.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.integrations.mappings.description")}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-5">
				{mappings.isPending ? (
					<p className="text-muted-foreground text-sm">{t("app.loading")}</p>
				) : rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("settings.integrations.mappings.empty")}
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									{t("settings.integrations.mappings.repo")}
								</TableHead>
								<TableHead>
									{t("settings.integrations.mappings.project")}
								</TableHead>
								<TableHead>
									{t("settings.integrations.mappings.source")}
								</TableHead>
								{canManage && <TableHead />}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((mapping) => (
								<TableRow key={mapping.id}>
									<TableCell className="font-mono text-xs">
										{mapping.repoFullName}
									</TableCell>
									<TableCell>{mapping.projectName}</TableCell>
									<TableCell>
										<Badge variant="secondary">
											{mapping.source === "installation"
												? t("settings.integrations.mappings.sourceInstallation")
												: t("settings.integrations.mappings.sourceManual")}
										</Badge>
									</TableCell>
									{canManage && (
										<TableCell className="text-right">
											<Button
												variant="ghost"
												size="sm"
												disabled={deleteMutation.isPending}
												onClick={() => deleteMutation.mutate(mapping.id)}
											>
												{t("settings.integrations.mappings.remove")}
											</Button>
										</TableCell>
									)}
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}

				{canManage && (
					<form
						className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
						onSubmit={(e) => {
							e.preventDefault();
							createMutation.mutate();
						}}
					>
						<div className="flex flex-1 flex-col gap-2">
							<Label htmlFor="gh-repo-full-name">
								{t("settings.integrations.mappings.repo")}
							</Label>
							<Input
								id="gh-repo-full-name"
								value={repoFullName}
								placeholder="owner/repo"
								onChange={(e) => setRepoFullName(e.target.value)}
							/>
						</div>
						<div className="flex flex-1 flex-col gap-2">
							<Label htmlFor="gh-mapping-project">
								{t("settings.integrations.mappings.project")}
							</Label>
							<Select value={projectId} onValueChange={setProjectId}>
								<SelectTrigger id="gh-mapping-project" className="w-full">
									<SelectValue
										placeholder={t(
											"settings.integrations.mappings.projectPlaceholder",
										)}
									/>
								</SelectTrigger>
								<SelectContent>
									{activeProjects.map((project) => (
										<SelectItem key={project.id} value={project.id}>
											{project.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button
							type="submit"
							disabled={
								createMutation.isPending ||
								repoFullName.trim() === "" ||
								projectId === ""
							}
						>
							{t("settings.integrations.mappings.add")}
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}

function UnmappedReposCard({ workspaceId }: { workspaceId: string }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const enabled = useQuery({
		queryKey: ["github-app-enabled"],
		queryFn: () => api.getGithubAppEnabled(),
	});
	const unmapped = useQuery({
		queryKey: ["github-unmapped", workspaceId],
		queryFn: () => api.listGithubUnmappedRepos(workspaceId),
		enabled: enabled.data?.enabled === true,
	});
	const projects = useQuery({
		queryKey: ["projects", workspaceId],
		queryFn: () => api.listProjects(workspaceId),
	});
	const [selections, setSelections] = useState<Record<string, string>>({});

	const mapMutation = useMutation({
		mutationFn: (input: { repoFullName: string; projectId: string }) =>
			api.createGithubMapping(workspaceId, input),
		onSuccess: async () => {
			toast.success(t("settings.integrations.mappings.added"));
			await queryClient.invalidateQueries({
				queryKey: ["github-mappings", workspaceId],
			});
			await queryClient.invalidateQueries({
				queryKey: ["github-unmapped", workspaceId],
			});
		},
		onError: (err: Error) => toast.error(err.message),
	});

	if (enabled.data?.enabled !== true) return null;
	const repos = unmapped.data?.repos ?? [];
	const activeProjects = (projects.data ?? []).filter((p) => !p.archivedAt);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.integrations.unmapped.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.integrations.unmapped.description")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{unmapped.isPending ? (
					<p className="text-muted-foreground text-sm">{t("app.loading")}</p>
				) : repos.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("settings.integrations.unmapped.empty")}
					</p>
				) : (
					<ul className="flex flex-col divide-y">
						{repos.map((repo) => (
							<li
								key={repo.fullName}
								className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
							>
								<span className="font-mono text-xs">{repo.fullName}</span>
								<div className="flex items-center gap-2">
									<Select
										value={selections[repo.fullName] ?? ""}
										onValueChange={(value) =>
											setSelections((prev) => ({
												...prev,
												[repo.fullName]: value,
											}))
										}
									>
										<SelectTrigger className="w-48">
											<SelectValue
												placeholder={t(
													"settings.integrations.mappings.projectPlaceholder",
												)}
											/>
										</SelectTrigger>
										<SelectContent>
											{activeProjects.map((project) => (
												<SelectItem key={project.id} value={project.id}>
													{project.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Button
										size="sm"
										disabled={
											!selections[repo.fullName] || mapMutation.isPending
										}
										onClick={() =>
											mapMutation.mutate({
												repoFullName: repo.fullName,
												projectId: selections[repo.fullName] ?? "",
											})
										}
									>
										{t("settings.integrations.unmapped.map")}
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
