import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	CheckIcon,
	CopyIcon,
	MoreHorizontalIcon,
	ShieldIcon,
	ShieldOffIcon,
	Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminBanner } from "@/components/admin-banner";
import { GitHubIcon, GoogleIcon } from "@/components/provider-icons";
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
import { api } from "@/lib/api";

export const Route = createFileRoute("/_authed/settings/users")({
	component: UsersSection,
});

function UsersSection() {
	const { t } = useTranslation();
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });

	if (me.isPending) {
		return <p className="text-muted-foreground text-sm">{t("app.loading")}</p>;
	}
	if (!me.data?.user.isAdmin) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{t("settings.users.title")}
					</CardTitle>
					<CardDescription>{t("settings.systemAdminOnly")}</CardDescription>
				</CardHeader>
			</Card>
		);
	}
	return <UsersManager currentUserId={me.data.user.id} />;
}

function UsersManager({ currentUserId }: { currentUserId: string }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [grantAdmin, setGrantAdmin] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [generatedPassword, setGeneratedPassword] = useState<string | null>(
		null,
	);
	const [copied, setCopied] = useState(false);

	const emailSettings = useQuery({
		queryKey: ["emailSettings"],
		queryFn: () => api.getEmailSettings(),
	});
	const emailEnabled = emailSettings.data?.emailEnabled ?? false;

	const users = useQuery({
		queryKey: ["users"],
		queryFn: () => api.listUsers(),
	});
	const invitations = useQuery({
		queryKey: ["invitations"],
		queryFn: () => api.listInvitations(),
		enabled: emailEnabled,
	});

	function resetForm() {
		setEmail("");
		setName("");
		setGrantAdmin(false);
		setError(null);
	}

	const createMutation = useMutation({
		mutationFn: () => api.createUser({ email, name, grantAdmin }),
		onSuccess: async (created) => {
			await queryClient.invalidateQueries({ queryKey: ["users"] });
			setGeneratedPassword(created.generatedPassword ?? null);
			setCopied(false);
			resetForm();
		},
		onError: (err: Error) => setError(err.message),
	});

	const inviteMutation = useMutation({
		mutationFn: () => api.createInvitation({ email, grantAdmin }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["invitations"] });
			resetForm();
		},
		onError: (err: Error) => setError(err.message),
	});

	const updateMutation = useMutation({
		mutationFn: (vars: { id: string; isAdmin: boolean }) =>
			api.updateUser(vars.id, { isAdmin: vars.isAdmin }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
		onError: (err: Error) => setError(err.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteUser(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
		onError: (err: Error) => setError(err.message),
	});

	const revokeMutation = useMutation({
		mutationFn: (id: string) => api.revokeInvitation(id),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["invitations"] }),
		onError: (err: Error) => setError(err.message),
	});

	const submitting = createMutation.isPending || inviteMutation.isPending;

	return (
		<div className="flex flex-col gap-4">
			<AdminBanner body={t("settings.users.adminBanner")} />
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{emailEnabled
							? t("settings.users.inviteTitle")
							: t("settings.users.createTitle")}
					</CardTitle>
					<CardDescription>
						{emailEnabled
							? t("settings.users.inviteDescription")
							: t("settings.users.createDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							setError(null);
							if (emailEnabled) inviteMutation.mutate();
							else createMutation.mutate();
						}}
					>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="flex flex-col gap-2">
								<Label htmlFor="user-email">{t("auth.email")}</Label>
								<Input
									id="user-email"
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
								/>
							</div>
							{!emailEnabled && (
								<div className="flex flex-col gap-2">
									<Label htmlFor="user-name">{t("auth.name")}</Label>
									<Input
										id="user-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										required
									/>
								</div>
							)}
						</div>
						<div className="flex items-center gap-2 text-sm">
							<Checkbox
								id="user-grant-admin"
								checked={grantAdmin}
								onCheckedChange={(v) => setGrantAdmin(v === true)}
							/>
							<Label htmlFor="user-grant-admin">
								{t("settings.users.grantAdmin")}
							</Label>
						</div>
						<div>
							<Button type="submit" disabled={submitting}>
								{emailEnabled
									? t("settings.users.inviteAction")
									: t("settings.users.createAction")}
							</Button>
						</div>
						{error && <p className="text-destructive text-sm">{error}</p>}
					</form>

					{generatedPassword && (
						<div className="border-border bg-muted/50 mt-4 flex flex-col gap-2 rounded-lg border p-4">
							<p className="text-sm font-medium">
								{t("settings.users.generatedTitle")}
							</p>
							<p className="text-muted-foreground text-sm">
								{t("settings.users.generatedDescription")}
							</p>
							<div className="flex items-center gap-2">
								<code className="bg-background flex-1 overflow-x-auto rounded-md px-3 py-2 font-mono text-xs">
									{generatedPassword}
								</code>
								<Button
									variant="outline"
									size="icon"
									aria-label={t("settings.users.copyAction")}
									onClick={async () => {
										await navigator.clipboard.writeText(generatedPassword);
										setCopied(true);
									}}
								>
									{copied ? <CheckIcon /> : <CopyIcon />}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="text-muted-foreground"
									onClick={() => setGeneratedPassword(null)}
								>
									{t("settings.users.dismissAction")}
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{t("settings.users.title")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("auth.name")}</TableHead>
								<TableHead>{t("auth.email")}</TableHead>
								<TableHead>{t("settings.users.authentication")}</TableHead>
								<TableHead>{t("settings.users.role")}</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{(users.data ?? []).map((user) => {
								const isSelf = user.id === currentUserId;
								return (
									<TableRow key={user.id}>
										<TableCell>
											{user.name}
											{isSelf && (
												<span className="text-muted-foreground">
													{" "}
													{t("settings.users.you")}
												</span>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{user.email}
										</TableCell>
										<TableCell>
											{user.providers.length > 0 ? (
												<span className="flex items-center gap-1.5">
													{user.providers.includes("google") && (
														<GoogleIcon className="size-4" />
													)}
													{user.providers.includes("github") && (
														<GitHubIcon className="size-4" />
													)}
												</span>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											{user.isAdmin ? (
												<Badge variant="secondary">
													{t("settings.users.admin")}
												</Badge>
											) : (
												<Badge variant="outline">
													{t("settings.users.member")}
												</Badge>
											)}
										</TableCell>
										<TableCell className="text-right">
											<UserRowActions
												isAdmin={user.isAdmin}
												isSelf={isSelf}
												disabled={updateMutation.isPending}
												onToggleAdmin={() => {
													setError(null);
													updateMutation.mutate({
														id: user.id,
														isAdmin: !user.isAdmin,
													});
												}}
												onDelete={() => {
													setError(null);
													deleteMutation.mutate(user.id);
												}}
											/>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			{emailEnabled && (invitations.data ?? []).length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="font-heading text-base">
							{t("settings.users.pendingTitle")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("auth.email")}</TableHead>
									<TableHead>{t("settings.users.role")}</TableHead>
									<TableHead>{t("settings.users.expires")}</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{(invitations.data ?? []).map((invitation) => (
									<TableRow key={invitation.id}>
										<TableCell>{invitation.email}</TableCell>
										<TableCell>
											{invitation.grantAdmin
												? t("settings.users.admin")
												: t("settings.users.member")}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{new Date(invitation.expiresAt).toLocaleDateString()}
										</TableCell>
										<TableCell className="text-right">
											<Button
												variant="ghost"
												size="sm"
												onClick={() => revokeMutation.mutate(invitation.id)}
											>
												{t("settings.users.revokeInvite")}
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function UserRowActions({
	isAdmin,
	isSelf,
	disabled,
	onToggleAdmin,
	onDelete,
}: {
	isAdmin: boolean;
	isSelf: boolean;
	disabled: boolean;
	onToggleAdmin: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const [deleting, setDeleting] = useState(false);
	// You cannot revoke your own admin role, nor delete your own account.
	const cannotToggle = isSelf && isAdmin;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="text-muted-foreground size-7"
						aria-label={t("settings.users.actionsMenu")}
					>
						<MoreHorizontalIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						disabled={cannotToggle || disabled}
						onClick={onToggleAdmin}
					>
						{isAdmin ? <ShieldOffIcon /> : <ShieldIcon />}
						{isAdmin
							? t("settings.users.revokeAdmin")
							: t("settings.users.makeAdmin")}
					</DropdownMenuItem>
					{!isSelf && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDeleting(true)}
							>
								<Trash2Icon />
								{t("settings.users.deleteAction")}
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={deleting} onOpenChange={setDeleting}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("settings.users.delete.title")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("settings.users.delete.description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{t("settings.users.delete.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({ variant: "destructive" })}
							onClick={onDelete}
						>
							{t("settings.users.delete.confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
