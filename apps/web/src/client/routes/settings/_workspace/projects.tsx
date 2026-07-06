import {
	DEFAULT_PROJECT_SYMBOL,
	PROJECT_SYMBOLS,
	type Project,
	type ProjectMemberAvatar,
	type ProjectSymbol,
	pickNextSymbol,
	type WorkspaceMember,
} from "@spantail/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ArchiveIcon,
	ArchiveRestoreIcon,
	CheckIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	Trash2Icon,
	TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PersonAvatar } from "@/components/person-avatar";
import { ProjectMarker } from "@/components/project-marker";
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
	CardAction,
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
import { useSettingsWorkspace } from "@/lib/settings-workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/_workspace/projects")({
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

function SymbolPicker({
	hue,
	value,
	onChange,
}: {
	hue: number;
	value: ProjectSymbol;
	onChange: (symbol: ProjectSymbol) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-wrap gap-2">
			{PROJECT_SYMBOLS.map((option) => {
				const selected = value === option;
				return (
					<button
						key={option}
						type="button"
						aria-label={`${t("settings.projects.symbol")} ${option}`}
						aria-pressed={selected}
						onClick={() => onChange(option)}
						className={cn(
							"border-border flex size-7 items-center justify-center rounded-full border transition-transform hover:scale-110",
							selected &&
								"ring-foreground ring-offset-background border-transparent ring-2 ring-offset-2",
						)}
					>
						<ProjectMarker hue={hue} symbol={option} size={16} />
					</button>
				);
			})}
		</div>
	);
}

// How many avatars to show before collapsing the rest into a "+N" badge.
const MAX_STACKED_AVATARS = 5;

/** Overlapping avatars for a project's members; trims past MAX_STACKED_AVATARS. */
function AvatarStack({ members }: { members: ProjectMemberAvatar[] }) {
	const { t } = useTranslation();
	if (members.length === 0) {
		return <span className="text-muted-foreground text-sm">—</span>;
	}
	const shown = members.slice(0, MAX_STACKED_AVATARS);
	const overflow = members.length - shown.length;
	return (
		<div className="flex items-center">
			<div className="flex -space-x-2">
				{shown.map((m) => (
					<div
						key={m.userId}
						className="ring-background rounded-full ring-2"
						title={m.name}
					>
						<PersonAvatar name={m.name} imageUrl={m.imageUrl} size={24} />
					</div>
				))}
			</div>
			{overflow > 0 && (
				<span
					className="bg-muted text-muted-foreground ring-background ml-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium ring-2"
					title={t("settings.projects.members.overflow", { count: overflow })}
				>
					+{overflow}
				</span>
			)}
		</div>
	);
}

/** Toggleable member chips (avatar + name + check), per the design mockup. */
function MemberChips({
	members,
	selected,
	onToggle,
}: {
	members: WorkspaceMember[];
	selected: string[];
	onToggle: (userId: string) => void;
}) {
	const { t } = useTranslation();
	if (members.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				{t("settings.projects.members.noWorkspaceMembers")}
			</p>
		);
	}
	return (
		<div className="flex flex-wrap gap-2">
			{members.map((member) => {
				const on = selected.includes(member.userId);
				return (
					<button
						key={member.userId}
						type="button"
						aria-pressed={on}
						onClick={() => onToggle(member.userId)}
						className={cn(
							"flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
							on
								? "border-foreground bg-muted"
								: "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
						)}
					>
						<PersonAvatar
							name={member.name}
							imageUrl={member.imageUrl}
							size={22}
						/>
						<span className="truncate">{member.name}</span>
						{on && <CheckIcon className="size-3.5 shrink-0" />}
					</button>
				);
			})}
		</div>
	);
}

function ProjectsSection() {
	const { t } = useTranslation();
	const { selected, canManage } = useSettingsWorkspace();

	if (!selected) {
		return (
			<p className="text-muted-foreground text-sm">{t("workspace.none")}</p>
		);
	}

	return <ProjectsCard key={selected.id} canManage={canManage} />;
}

function ProjectsCard({ canManage }: { canManage: boolean }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { selected } = useSettingsWorkspace();
	const workspaceId = selected?.id ?? "";
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Project | null>(null);
	const [deleting, setDeleting] = useState<Project | null>(null);

	const projects = useQuery({
		queryKey: ["projects", workspaceId],
		queryFn: () => api.listProjects(workspaceId),
		enabled: Boolean(workspaceId),
	});

	// The least-used symbol among existing projects, so a new project defaults to
	// a shape that isn't already crowded.
	const suggestedSymbol = useMemo(
		() => pickNextSymbol((projects.data ?? []).map((p) => p.symbol)),
		[projects.data],
	);

	// Workspace members feed the form dialog's member chips.
	const workspaceMembers = useQuery({
		queryKey: ["members", workspaceId],
		queryFn: () => api.listMembers(workspaceId),
		enabled: Boolean(workspaceId),
	});

	// All project memberships in the workspace, grouped by project for the table.
	const projectMembers = useQuery({
		queryKey: ["project-members", workspaceId],
		queryFn: () => api.listWorkspaceProjectMembers(workspaceId),
		enabled: Boolean(workspaceId),
	});
	const membersByProject = useMemo(() => {
		const map = new Map<string, ProjectMemberAvatar[]>();
		for (const m of projectMembers.data ?? []) {
			const list = map.get(m.projectId);
			if (list) list.push(m);
			else map.set(m.projectId, [m]);
		}
		return map;
	}, [projectMembers.data]);

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
	const refreshMembers = () =>
		queryClient.invalidateQueries({
			queryKey: ["project-members", workspaceId],
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

	const closeForm = () => {
		setFormOpen(false);
		setEditing(null);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.projects.title")}
				</CardTitle>
				<CardDescription>{t("settings.projects.description")}</CardDescription>
				{canManage && (
					<CardAction>
						<Button
							onClick={() => {
								setEditing(null);
								setFormOpen(true);
							}}
						>
							<PlusIcon />
							{t("settings.projects.newAction")}
						</Button>
					</CardAction>
				)}
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("settings.projects.name")}</TableHead>
							<TableHead>{t("settings.slug")}</TableHead>
							<TableHead>{t("settings.projects.members.title")}</TableHead>
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
										<ProjectMarker hue={project.hue} symbol={project.symbol} />
										{project.name}
									</span>
								</TableCell>
								<TableCell className="text-muted-foreground">
									{project.slug}
								</TableCell>
								<TableCell>
									<AvatarStack
										members={membersByProject.get(project.id) ?? []}
									/>
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
												<DropdownMenuItem
													onClick={() => {
														setEditing(project);
														setFormOpen(true);
													}}
												>
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
			{formOpen && (
				<ProjectFormDialog
					project={editing}
					workspaceId={workspaceId}
					workspaceMembers={workspaceMembers.data ?? []}
					suggestedSymbol={suggestedSymbol}
					onOpenChange={(open) => {
						if (!open) closeForm();
					}}
					onSaved={async (mode) => {
						closeForm();
						await Promise.all([refresh(), refreshMembers()]);
						if (mode === "edit") {
							invalidateWorkEntryData(queryClient, workspaceId);
						}
						toast.success(
							mode === "create"
								? t("settings.projects.toast.created")
								: t("settings.projects.toast.updated"),
						);
					}}
				/>
			)}
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

/**
 * One dialog for create and edit — name/slug, color, symbol, members and
 * description, per the design mockup. On edit, the member chips are seeded
 * from the project's current members and diffed on save.
 */
function ProjectFormDialog({
	project,
	workspaceId,
	workspaceMembers,
	suggestedSymbol,
	onOpenChange,
	onSaved,
}: {
	project: Project | null;
	workspaceId: string;
	workspaceMembers: WorkspaceMember[];
	suggestedSymbol: ProjectSymbol;
	onOpenChange: (open: boolean) => void;
	onSaved: (mode: "create" | "edit") => void;
}) {
	const { t } = useTranslation();
	const isEdit = Boolean(project);
	const [name, setName] = useState(project?.name ?? "");
	const [slug, setSlug] = useState(project?.slug ?? "");
	const [description, setDescription] = useState(project?.description ?? "");
	const [hue, setHue] = useState<number>(project?.hue ?? DEFAULT_PROJECT_HUE);
	const [symbol, setSymbol] = useState<ProjectSymbol>(
		project?.symbol ?? (isEdit ? DEFAULT_PROJECT_SYMBOL : suggestedSymbol),
	);
	const [memberIds, setMemberIds] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);

	// Editing needs the project's current members to seed the chips (and to
	// diff against on save). Seed once when they load; later refetches must not
	// clobber the user's in-progress selection.
	const currentMembers = useQuery({
		queryKey: ["project-member-list", project?.id ?? ""],
		queryFn: () => api.listProjectMembers(project?.id ?? ""),
		enabled: isEdit,
	});
	const seeded = useRef(false);
	useEffect(() => {
		if (!seeded.current && currentMembers.data) {
			seeded.current = true;
			setMemberIds(currentMembers.data.map((m) => m.userId));
		}
	}, [currentMembers.data]);

	const toggleMember = (userId: string) =>
		setMemberIds((ids) =>
			ids.includes(userId)
				? ids.filter((id) => id !== userId)
				: [...ids, userId],
		);

	const mutation = useMutation({
		mutationFn: async () => {
			if (!project) {
				await api.createProject(workspaceId, {
					slug: slug.trim(),
					name: name.trim(),
					hue,
					symbol,
					memberUserIds: memberIds,
				});
				return;
			}
			await api.updateProject(project.id, {
				name: name.trim(),
				slug: slug.trim(),
				description: description.trim() || null,
				hue,
				symbol,
			});
			const original = new Set(
				(currentMembers.data ?? []).map((m) => m.userId),
			);
			const chosen = new Set(memberIds);
			await Promise.all([
				...memberIds
					.filter((id) => !original.has(id))
					.map((id) => api.addProjectMember(project.id, { userId: id })),
				...[...original]
					.filter((id) => !chosen.has(id))
					.map((id) => api.removeProjectMember(project.id, id)),
			]);
		},
		onSuccess: () => onSaved(isEdit ? "edit" : "create"),
		onError: (err: Error) => setError(err.message),
	});

	const valid = name.trim().length > 0 && slug.trim().length > 0;
	// Block saving an edit until the current members are known — otherwise the
	// diff would remove every existing member.
	const membersReady = !isEdit || Boolean(currentMembers.data);

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent size="2xl">
				<DialogHeader>
					<DialogTitle>
						{isEdit
							? t("settings.projects.editTitle")
							: t("settings.projects.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? t("settings.projects.editDescription")
							: t("settings.projects.createDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-5 sm:grid-cols-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid && membersReady) mutation.mutate();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="pf-name">{t("settings.projects.name")}</Label>
						<Input
							id="pf-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="pf-slug">{t("settings.slug")}</Label>
						<Input
							id="pf-slug"
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
						<Label>{t("settings.projects.symbol")}</Label>
						<SymbolPicker hue={hue} value={symbol} onChange={setSymbol} />
						<p className="text-muted-foreground text-xs">
							{t("settings.projects.symbolHint")}
						</p>
					</div>
					<div className="flex flex-col gap-2 sm:col-span-2">
						<Label>{t("settings.projects.members.label")}</Label>
						<MemberChips
							members={workspaceMembers}
							selected={memberIds}
							onToggle={toggleMember}
						/>
						<p className="text-muted-foreground text-xs">
							{memberIds.length === 0
								? t("settings.projects.members.noneHint")
								: t("settings.projects.members.selectedCount", {
										count: memberIds.length,
									})}
						</p>
					</div>
					<div className="flex flex-col gap-2 sm:col-span-2">
						<Label htmlFor="pf-desc">
							{t("settings.projects.descriptionLabel")}
						</Label>
						<Textarea
							id="pf-desc"
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
						<Button
							type="submit"
							disabled={!valid || !membersReady || mutation.isPending}
						>
							{isEdit
								? t("settings.projects.save")
								: t("settings.projects.createConfirm")}
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
