import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { WorkspaceRole } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TokensCard } from "@/components/tokens-card";
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
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/settings")({
	component: SettingsPage,
});

function browserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function SettingsPage() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const { session } = Route.useRouteContext();
	const isInstanceAdmin = Boolean(session.user.isAdmin);
	const canManage = current?.role === "owner" || current?.role === "admin";

	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<h1 className="font-heading text-lg font-semibold">
				{t("settings.title")}
			</h1>
			{isInstanceAdmin && <CreateWorkspaceCard />}
			{current && canManage && <EditWorkspaceCard key={current.id} />}
			{current && <ProjectsCard canManage={canManage} />}
			{current && <MembersCard canManage={canManage} />}
			<TokensCard />
		</div>
	);
}

function CreateWorkspaceCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { setCurrentId } = useWorkspace();
	const [slug, setSlug] = useState("");
	const [name, setName] = useState("");
	const [timezone, setTimezone] = useState(browserTimezone);
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () => api.createWorkspace({ slug, name, timezone }),
		onSuccess: async (workspace) => {
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			setCurrentId(workspace.id);
			setSlug("");
			setName("");
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.createWorkspace.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.createWorkspace.description")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4 sm:grid-cols-3"
					onSubmit={(e) => {
						e.preventDefault();
						mutation.mutate();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="ws-name">{t("settings.workspaceName")}</Label>
						<Input
							id="ws-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="ws-slug">{t("settings.slug")}</Label>
						<Input
							id="ws-slug"
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							pattern="[a-z0-9][a-z0-9-]*"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="ws-tz">{t("settings.timezone")}</Label>
						<Input
							id="ws-tz"
							value={timezone}
							onChange={(e) => setTimezone(e.target.value)}
							required
						/>
					</div>
					{error && (
						<p className="text-destructive text-sm sm:col-span-3">{error}</p>
					)}
					<div className="sm:col-span-3">
						<Button type="submit" disabled={mutation.isPending}>
							{t("settings.createAction")}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

function EditWorkspaceCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { current } = useWorkspace();
	const [name, setName] = useState(current?.name ?? "");
	const [timezone, setTimezone] = useState(current?.timezone ?? "");
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () => {
			if (!current) throw new Error("no workspace");
			return api.updateWorkspace(current.id, { name, timezone });
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.editWorkspace.title", { name: current?.name })}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4 sm:grid-cols-2"
					onSubmit={(e) => {
						e.preventDefault();
						mutation.mutate();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-ws-name">{t("settings.workspaceName")}</Label>
						<Input
							id="edit-ws-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-ws-tz">{t("settings.timezone")}</Label>
						<Input
							id="edit-ws-tz"
							value={timezone}
							onChange={(e) => setTimezone(e.target.value)}
							required
						/>
					</div>
					{error && (
						<p className="text-destructive text-sm sm:col-span-2">{error}</p>
					)}
					<div className="sm:col-span-2">
						<Button type="submit" disabled={mutation.isPending}>
							{t("settings.saveAction")}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
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
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{canManage && (
					<form
						className="grid gap-4 sm:grid-cols-3"
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
											project.status === "active" ? "default" : "secondary"
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

function MembersCard({ canManage }: { canManage: boolean }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { current } = useWorkspace();
	const workspaceId = current?.id ?? "";
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Exclude<WorkspaceRole, "owner">>("member");
	const [error, setError] = useState<string | null>(null);

	const members = useQuery({
		queryKey: ["members", workspaceId],
		queryFn: () => api.listMembers(workspaceId),
		enabled: Boolean(workspaceId),
	});

	const addMutation = useMutation({
		mutationFn: () => api.addMember(workspaceId, { email, role }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["members", workspaceId],
			});
			setEmail("");
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const removeMutation = useMutation({
		mutationFn: (userId: string) => api.removeMember(workspaceId, userId),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["members", workspaceId] }),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.members.title")}
				</CardTitle>
				{canManage && (
					<CardDescription>{t("settings.members.description")}</CardDescription>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{canManage && (
					<form
						className="grid gap-4 sm:grid-cols-3"
						onSubmit={(e) => {
							e.preventDefault();
							addMutation.mutate();
						}}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="member-email">{t("auth.email")}</Label>
							<Input
								id="member-email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("settings.members.role")}</Label>
							<Select
								value={role}
								onValueChange={(v) =>
									setRole(v as Exclude<WorkspaceRole, "owner">)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="member">{t("roles.member")}</SelectItem>
									<SelectItem value="admin">{t("roles.admin")}</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-end">
							<Button type="submit" disabled={addMutation.isPending}>
								{t("settings.members.addAction")}
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
							<TableHead>{t("auth.name")}</TableHead>
							<TableHead>{t("auth.email")}</TableHead>
							<TableHead>{t("settings.members.role")}</TableHead>
							{canManage && <TableHead />}
						</TableRow>
					</TableHeader>
					<TableBody>
						{(members.data ?? []).map((member) => (
							<TableRow key={member.userId}>
								<TableCell>{member.name}</TableCell>
								<TableCell className="text-muted-foreground">
									{member.email}
								</TableCell>
								<TableCell>
									<Badge variant="secondary">{t(`roles.${member.role}`)}</Badge>
								</TableCell>
								{canManage && (
									<TableCell className="text-right">
										{member.role !== "owner" && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => removeMutation.mutate(member.userId)}
											>
												{t("settings.members.removeAction")}
											</Button>
										)}
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
