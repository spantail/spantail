import type { Project } from "@spantail/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ArchiveIcon,
	ArchiveRestoreIcon,
	CheckIcon,
	MoreHorizontalIcon,
	PencilIcon,
	Trash2Icon,
	TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Dot } from "@/components/dot";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { invalidateWorkEntryData } from "@/lib/query";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/settings/projects")({
	component: ProjectsSection,
});

// Hand-picked OKLCH hues offered by the color picker (mirrors the design kit).
const PROJECT_HUES = [264, 240, 200, 160, 120, 80, 40, 20, 340, 300];
// Matches the `hue` column default in the db schema.
const DEFAULT_PROJECT_HUE = 264;

function ColorPicker({
	value,
	onChange,
}: {
	value: number;
	onChange: (hue: number) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-wrap gap-2">
			{PROJECT_HUES.map((option) => {
				const selected = value === option;
				return (
					<button
						key={option}
						type="button"
						aria-label={`${t("settings.projects.color")} ${option}`}
						aria-pressed={selected}
						onClick={() => onChange(option)}
						className={cn(
							"flex size-7 items-center justify-center rounded-full transition-transform hover:scale-110",
							selected &&
								"ring-foreground ring-offset-background ring-2 ring-offset-2",
						)}
						style={{ background: `oklch(0.62 0.17 ${option})` }}
					>
						{selected && <CheckIcon className="size-3.5 text-white" />}
					</button>
				);
			})}
		</div>
	);
}

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
	const [hue, setHue] = useState<number>(DEFAULT_PROJECT_HUE);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState<Project | null>(null);
	const [deleting, setDeleting] = useState<Project | null>(null);

	const projects = useQuery({
		queryKey: ["projects", workspaceId],
		queryFn: () => api.listProjects(workspaceId),
		enabled: Boolean(workspaceId),
	});

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });

	const createMutation = useMutation({
		mutationFn: () => api.createProject(workspaceId, { slug, name, hue }),
		onSuccess: async () => {
			await refresh();
			setSlug("");
			setName("");
			setHue(DEFAULT_PROJECT_HUE);
			setError(null);
			toast.success(t("settings.projects.toast.created"));
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
		onSuccess: async (_data, variables) => {
			await refresh();
			toast.success(
				variables.status === "archived"
					? t("settings.projects.toast.archived")
					: t("settings.projects.toast.unarchived"),
			);
		},
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
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							createMutation.mutate();
						}}
					>
						<div className="grid gap-4 sm:grid-cols-2">
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
									placeholder={t("settings.projects.slugPlaceholder")}
									pattern="[a-z0-9][a-z0-9-]*"
									required
								/>
							</div>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("settings.projects.color")}</Label>
							<ColorPicker value={hue} onChange={setHue} />
						</div>
						{error && <p className="text-destructive text-sm">{error}</p>}
						<div>
							<Button type="submit" disabled={createMutation.isPending}>
								{t("settings.createAction")}
							</Button>
						</div>
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
							<TableRow
								key={project.id}
								className={project.status === "archived" ? "opacity-70" : ""}
							>
								<TableCell>
									<span className="flex items-center gap-2">
										<Dot hue={project.hue} />
										{project.name}
									</span>
								</TableCell>
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
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													className="text-muted-foreground size-8"
													aria-label={t("settings.projects.actions")}
												>
													<MoreHorizontalIcon />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-48">
												<DropdownMenuItem onClick={() => setEditing(project)}>
													<PencilIcon />
													{t("settings.projects.edit")}
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() =>
														statusMutation.mutate({
															id: project.id,
															status:
																project.status === "active"
																	? "archived"
																	: "active",
														})
													}
												>
													{project.status === "active" ? (
														<ArchiveIcon />
													) : (
														<ArchiveRestoreIcon />
													)}
													{project.status === "active"
														? t("settings.projects.archive")
														: t("settings.projects.unarchive")}
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													variant="destructive"
													disabled={project.status !== "archived"}
													onClick={() => setDeleting(project)}
												>
													<Trash2Icon />
													{t("settings.projects.delete")}
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
			<ProjectEditDialog
				project={editing}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onSaved={async () => {
					setEditing(null);
					await refresh();
					invalidateWorkEntryData(queryClient, workspaceId);
					toast.success(t("settings.projects.toast.updated"));
				}}
			/>
			<DeleteProjectDialog
				project={deleting}
				onOpenChange={(open) => {
					if (!open) setDeleting(null);
				}}
				onDeleted={async () => {
					setDeleting(null);
					await refresh();
					invalidateWorkEntryData(queryClient, workspaceId);
					toast.success(t("settings.projects.toast.deleted"));
				}}
			/>
		</Card>
	);
}

function ProjectEditDialog({
	project,
	onOpenChange,
	onSaved,
}: {
	project: Project | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [description, setDescription] = useState("");
	const [hue, setHue] = useState<number>(DEFAULT_PROJECT_HUE);
	const [error, setError] = useState<string | null>(null);

	// Seed the form whenever a different project is opened for editing.
	useEffect(() => {
		if (project) {
			setName(project.name);
			setSlug(project.slug);
			setDescription(project.description ?? "");
			setHue(project.hue);
			setError(null);
		}
	}, [project]);

	const mutation = useMutation({
		mutationFn: () => {
			if (!project) throw new Error("no project");
			return api.updateProject(project.id, {
				name: name.trim(),
				slug: slug.trim(),
				description: description.trim() || null,
				hue,
			});
		},
		onSuccess: () => onSaved(),
		onError: (err: Error) => setError(err.message),
	});

	const valid = name.trim().length > 0 && slug.trim().length > 0;

	return (
		<Dialog open={Boolean(project)} onOpenChange={onOpenChange}>
			<DialogContent size="2xl">
				<DialogHeader>
					<DialogTitle>{t("settings.projects.editTitle")}</DialogTitle>
					<DialogDescription>
						{t("settings.projects.editDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-5 sm:grid-cols-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid) mutation.mutate();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="pe-name">{t("settings.projects.name")}</Label>
						<Input
							id="pe-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="pe-slug">{t("settings.slug")}</Label>
						<Input
							id="pe-slug"
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							placeholder={t("settings.projects.slugPlaceholder")}
							pattern="[a-z0-9][a-z0-9-]*"
							required
						/>
					</div>
					<div className="flex flex-col gap-2 sm:col-span-2">
						<Label>{t("settings.projects.color")}</Label>
						<ColorPicker value={hue} onChange={setHue} />
					</div>
					<div className="flex flex-col gap-2 sm:col-span-2">
						<Label htmlFor="pe-desc">
							{t("settings.projects.descriptionLabel")}
						</Label>
						<Textarea
							id="pe-desc"
							rows={3}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder={t("settings.projects.descriptionPlaceholder")}
						/>
					</div>
					{error && (
						<p className="text-destructive text-sm sm:col-span-2">{error}</p>
					)}
					<DialogFooter className="sm:col-span-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{t("settings.cancelAction")}
						</Button>
						<Button type="submit" disabled={!valid || mutation.isPending}>
							{t("settings.projects.save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeleteProjectDialog({
	project,
	onOpenChange,
	onDeleted,
}: {
	project: Project | null;
	onOpenChange: (open: boolean) => void;
	onDeleted: () => void;
}) {
	const { t } = useTranslation();

	const mutation = useMutation({
		mutationFn: () => {
			if (!project) throw new Error("no project");
			return api.deleteProject(project.id);
		},
		onSuccess: () => onDeleted(),
	});

	return (
		<AlertDialog open={Boolean(project)} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("settings.projects.deleteTitle")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("settings.projects.deleteDescription")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="border-destructive/30 bg-destructive/10 flex gap-3 rounded-xl border p-4">
					<span className="bg-destructive/15 text-destructive mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full">
						<TriangleAlertIcon className="size-[18px]" />
					</span>
					<div className="min-w-0 text-sm">
						<p className="text-destructive font-semibold">
							{t("settings.projects.deleteWarningTitle")}
						</p>
						<p className="text-destructive/80 mt-1 leading-relaxed">
							{t("settings.projects.deleteWarningBody", {
								name: project?.name ?? "",
							})}
						</p>
					</div>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("settings.cancelAction")}</AlertDialogCancel>
					<AlertDialogAction
						className={buttonVariants({ variant: "destructive" })}
						onClick={(e) => {
							e.preventDefault();
							mutation.mutate();
						}}
					>
						<Trash2Icon />
						{t("settings.projects.deleteConfirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
