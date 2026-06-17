import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/settings/projects")({
	component: ProjectsSection,
});

function ProjectsSection() {
	const { t } = useTranslation();
	const { current } = useWorkspace();

	if (!current) {
		return (
			<p className="text-muted-foreground text-sm">{t("workspace.none")}</p>
		);
	}

	const canManage = current.role === "owner" || current.role === "admin";
	return <ProjectsCard canManage={canManage} />;
}

function ProjectsCard({ canManage }: { canManage: boolean }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { current } = useWorkspace();
	const workspaceId = current?.id ?? "";
	const [slug, setSlug] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);

	const projects = useQuery({
		queryKey: ["projects", workspaceId],
		queryFn: () => api.listProjects(workspaceId),
		enabled: Boolean(workspaceId),
	});

	const createMutation = useMutation({
		mutationFn: () => api.createProject(workspaceId, { slug, name }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["projects", workspaceId],
			});
			setSlug("");
			setName("");
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const statusMutation = useMutation({
		mutationFn: ({
			id,
			status,
		}: {
			id: string;
			status: "active" | "archived";
		}) => api.updateProject(id, { status }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] }),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.projects.title")}
				</CardTitle>
				<CardDescription>{t("settings.projects.description")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{canManage && (
					<form
						className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
						onSubmit={(e) => {
							e.preventDefault();
							createMutation.mutate();
						}}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="prj-name">{t("settings.projects.name")}</Label>
							<Input
								id="prj-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="prj-slug">{t("settings.slug")}</Label>
							<Input
								id="prj-slug"
								value={slug}
								onChange={(e) => setSlug(e.target.value)}
								pattern="[a-z0-9][a-z0-9-]*"
								required
							/>
						</div>
						<div className="flex items-end">
							<Button type="submit" disabled={createMutation.isPending}>
								{t("settings.createAction")}
							</Button>
						</div>
						{error && (
							<p className="text-destructive text-sm sm:col-span-3">{error}</p>
						)}
					</form>
				)}
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("settings.projects.name")}</TableHead>
							<TableHead>{t("settings.slug")}</TableHead>
							<TableHead>{t("settings.status")}</TableHead>
							{canManage && <TableHead />}
						</TableRow>
					</TableHeader>
					<TableBody>
						{(projects.data ?? []).map((project) => (
							<TableRow key={project.id}>
								<TableCell>{project.name}</TableCell>
								<TableCell className="text-muted-foreground">
									{project.slug}
								</TableCell>
								<TableCell>
									<Badge
										variant={
											project.status === "active" ? "outline" : "secondary"
										}
									>
										{t(`settings.projects.status.${project.status}`)}
									</Badge>
								</TableCell>
								{canManage && (
									<TableCell className="text-right">
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												statusMutation.mutate({
													id: project.id,
													status:
														project.status === "active" ? "archived" : "active",
												})
											}
										>
											{project.status === "active"
												? t("settings.projects.archive")
												: t("settings.projects.unarchive")}
										</Button>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
