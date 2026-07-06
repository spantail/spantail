import {
	DEFAULT_PROJECT_SYMBOL,
	PROJECT_SYMBOLS,
	type Project,
	type ProjectMember,
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
	Trash2Icon,
	TriangleAlertIcon,
	UsersIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
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

/** Popover checkbox list for picking initial project members on create. */
function MemberMultiSelect({
	members,
	selected,
	onChange,
}: {
	members: WorkspaceMember[];
	selected: string[];
	onChange: (ids: string[]) => void;
}) {
	const { t } = useTranslation();
	const toggle = (userId: string) => {
		onChange(
			selected.includes(userId)
				? selected.filter((id) => id !== userId)
				: [...selected, userId],
		);
	};
	const label =
		selected.length === 0
			? t("settings.projects.members.selectPlaceholder")
			: t("settings.projects.members.selectedCount", {
					count: selected.length,
				});
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className="w-full justify-between font-normal sm:w-72"
				>
					<span
						className={selected.length === 0 ? "text-muted-foreground" : ""}
					>
						{label}
					</span>
					<UsersIcon className="text-muted-foreground size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-2">
				{members.length === 0 ? (
					<p className="text-muted-foreground p-2 text-sm">
						{t("settings.projects.members.noWorkspaceMembers")}
					</p>
				) : (
					<div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
						{members.map((member) => (
							<label
								key={member.userId}
								htmlFor={`pm-pick-${member.userId}`}
								className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md p-1.5"
							>
								<Checkbox
									id={`pm-pick-${member.userId}`}
									checked={selected.includes(member.userId)}
									onCheckedChange={() => toggle(member.userId)}
								/>
								<PersonAvatar
									name={member.name}
									imageUrl={member.imageUrl}
									size={24}
								/>
								<span className="min-w-0 flex-1 truncate text-sm">
									{member.name}
								</span>
							</label>
						))}
					</div>
				)}
			</PopoverContent>
		</Popover>
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
	const [slug, setSlug] = useState("");
	const [name, setName] = useState("");
	const [hue, setHue] = useState<number>(DEFAULT_PROJECT_HUE);
	const [symbol, setSymbol] = useState<ProjectSymbol>(DEFAULT_PROJECT_SYMBOL);
	// Until the user picks a symbol, the form tracks a suggestion that spreads
	// variety across the workspace's existing projects (see the effect below).
	const [symbolTouched, setSymbolTouched] = useState(false);
	const [memberIds, setMemberIds] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState<Project | null>(null);
	const [deleting, setDeleting] = useState<Project | null>(null);
	const [managing, setManaging] = useState<Project | null>(null);

	const projects = useQuery({
		queryKey: ["projects", workspaceId],
		queryFn: () => api.listProjects(workspaceId),
		enabled: Boolean(workspaceId),
	});

	// The least-used symbol among existing projects, so a new project defaults to
	// a shape that isn't already crowded. Recomputes as projects load / change.
	const suggestedSymbol = useMemo(
		() => pickNextSymbol((projects.data ?? []).map((p) => p.symbol)),
		[projects.data],
	);
	useEffect(() => {
		if (!symbolTouched) setSymbol(suggestedSymbol);
	}, [suggestedSymbol, symbolTouched]);

	// Workspace members feed the create form's member picker and the manage dialog.
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

	const createMutation = useMutation({
		mutationFn: () =>
			api.createProject(workspaceId, {
				slug,
				name,
				hue,
				symbol,
				memberUserIds: memberIds,
			}),
		onSuccess: async () => {
			await Promise.all([refresh(), refreshMembers()]);
			setSlug("");
			setName("");
			setHue(DEFAULT_PROJECT_HUE);
			// Re-enable the auto-suggestion so the next project picks a fresh shape
			// (the refreshed project list now includes the one just created).
			setSymbolTouched(false);
			setMemberIds([]);
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
						<div className="flex flex-col gap-2">
							<Label>{t("settings.projects.symbol")}</Label>
							<SymbolPicker
								hue={hue}
								value={symbol}
								onChange={(s) => {
									setSymbol(s);
									setSymbolTouched(true);
								}}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("settings.projects.members.label")}</Label>
							<MemberMultiSelect
								members={workspaceMembers.data ?? []}
								selected={memberIds}
								onChange={setMemberIds}
							/>
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
												<DropdownMenuItem onClick={() => setEditing(project)}>
													<PencilIcon />
													{t("settings.projects.edit")}
												</DropdownMenuItem>
												<DropdownMenuItem onClick={() => setManaging(project)}>
													<UsersIcon />
													{t("settings.projects.members.manage")}
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
			<ProjectMembersDialog
				project={managing}
				workspaceMembers={workspaceMembers.data ?? []}
				onOpenChange={(open) => {
					if (!open) setManaging(null);
				}}
				onChanged={async () => {
					await refreshMembers();
					invalidateWorkEntryData(queryClient, workspaceId);
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
	const [symbol, setSymbol] = useState<ProjectSymbol>(DEFAULT_PROJECT_SYMBOL);
	const [error, setError] = useState<string | null>(null);

	// Seed the form whenever a different project is opened for editing.
	useEffect(() => {
		if (project) {
			setName(project.name);
			setSlug(project.slug);
			setDescription(project.description ?? "");
			setHue(project.hue);
			setSymbol(project.symbol);
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
				symbol,
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
						<Label>{t("settings.projects.symbol")}</Label>
						<SymbolPicker hue={hue} value={symbol} onChange={setSymbol} />
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

/** Manage a project's members: list current members, add or remove them. */
function ProjectMembersDialog({
	project,
	workspaceMembers,
	onOpenChange,
	onChanged,
}: {
	project: Project | null;
	workspaceMembers: WorkspaceMember[];
	onOpenChange: (open: boolean) => void;
	onChanged: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [addUserId, setAddUserId] = useState("");
	const projectId = project?.id ?? "";

	const members = useQuery({
		queryKey: ["project-member-list", projectId],
		queryFn: () => api.listProjectMembers(projectId),
		enabled: Boolean(projectId),
	});

	const refresh = async () => {
		await queryClient.invalidateQueries({
			queryKey: ["project-member-list", projectId],
		});
		onChanged();
	};

	const addMutation = useMutation({
		mutationFn: (userId: string) => api.addProjectMember(projectId, { userId }),
		onSuccess: async () => {
			setAddUserId("");
			await refresh();
		},
	});

	const removeMutation = useMutation({
		mutationFn: (userId: string) => api.removeProjectMember(projectId, userId),
		onSuccess: () => refresh(),
	});

	const memberIds = new Set(
		(members.data ?? []).map((m: ProjectMember) => m.userId),
	);
	const candidates = workspaceMembers.filter((m) => !memberIds.has(m.userId));

	return (
		<Dialog open={Boolean(project)} onOpenChange={onOpenChange}>
			<DialogContent size="2xl">
				<DialogHeader>
					<DialogTitle>
						{t("settings.projects.members.manageTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("settings.projects.members.manageDescription")}
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-end gap-2">
					<div className="flex flex-1 flex-col gap-2">
						<Label>{t("settings.projects.members.addLabel")}</Label>
						<Select value={addUserId} onValueChange={setAddUserId}>
							<SelectTrigger>
								<SelectValue
									placeholder={t("settings.projects.members.addPlaceholder")}
								/>
							</SelectTrigger>
							<SelectContent>
								{candidates.map((m) => (
									<SelectItem key={m.userId} value={m.userId}>
										{m.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Button
						type="button"
						disabled={!addUserId || addMutation.isPending}
						onClick={() => addMutation.mutate(addUserId)}
					>
						{t("settings.projects.members.addAction")}
					</Button>
				</div>
				<div className="flex flex-col gap-1">
					{(members.data ?? []).length === 0 ? (
						<p className="text-muted-foreground py-2 text-sm">
							{t("settings.projects.members.empty")}
						</p>
					) : (
						(members.data ?? []).map((member: ProjectMember) => (
							<div
								key={member.userId}
								className="flex items-center gap-3 rounded-md py-1.5"
							>
								<PersonAvatar
									name={member.name}
									imageUrl={member.imageUrl}
									size={28}
								/>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">{member.name}</p>
									<p className="text-muted-foreground truncate text-xs">
										{member.email}
									</p>
								</div>
								<Button
									variant="ghost"
									size="sm"
									disabled={removeMutation.isPending}
									onClick={() => removeMutation.mutate(member.userId)}
								>
									{t("settings.projects.members.removeAction")}
								</Button>
							</div>
						))
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
