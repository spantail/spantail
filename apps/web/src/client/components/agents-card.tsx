import {
	type AgentType,
	type AgentWithToken,
	agentTypes,
	todayInTimezone,
} from "@spantail/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BanIcon,
	CheckIcon,
	CirclePlayIcon,
	CopyIcon,
	KeyRoundIcon,
	MoreHorizontalIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { api } from "@/lib/api";
import { formatInstantDate, formatTimestamp } from "@/lib/format";

/** A freshly issued secret to surface once, with the agent it belongs to. */
type IssuedSecret = {
	agentName: string;
	secret: string;
};

export function AgentsCard() {
	const { t, i18n } = useTranslation();
	const timezone = useUserTimezone();
	const today = todayInTimezone(timezone);
	const queryClient = useQueryClient();
	const [formOpen, setFormOpen] = useState(false);
	const [issued, setIssued] = useState<IssuedSecret | null>(null);
	const [deleting, setDeleting] = useState<AgentWithToken | null>(null);

	const agents = useQuery({
		queryKey: ["agents"],
		queryFn: () => api.listAgents(),
	});

	const invalidateAgents = () =>
		queryClient.invalidateQueries({ queryKey: ["agents"] });

	const updateMutation = useMutation({
		mutationFn: (vars: { id: string; disabled: boolean }) =>
			api.updateAgent(vars.id, { disabled: vars.disabled }),
		onSuccess: async (_data, vars) => {
			await invalidateAgents();
			toast.success(
				vars.disabled
					? t("settings.agents.toast.disabled")
					: t("settings.agents.toast.enabled"),
			);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const rotateMutation = useMutation({
		mutationFn: (agent: AgentWithToken) =>
			api.rotateAgentToken(agent.id).then((res) => ({
				agentName: agent.name,
				secret: res.secret,
			})),
		onSuccess: async (result) => {
			await invalidateAgents();
			setIssued(result);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteAgent(id),
		onSuccess: async () => {
			await invalidateAgents();
			setDeleting(null);
			toast.success(t("settings.agents.toast.deleted"));
		},
		onError: (err: Error) => toast.error(err.message),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.agents.title")}
				</CardTitle>
				<CardDescription>{t("settings.agents.description")}</CardDescription>
				<CardAction>
					{/* The mockup's small action button: h-8 with text-xs. */}
					<Button
						className="gap-1.5 px-3 text-xs"
						onClick={() => setFormOpen(true)}
					>
						<PlusIcon className="size-3.5" />
						{t("settings.agents.newAction")}
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent>
				{(agents.data ?? []).length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("settings.agents.empty")}
					</p>
				) : (
					<Table className="[&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3">
						<TableHeader>
							<TableRow>
								<TableHead>{t("settings.agents.name")}</TableHead>
								<TableHead>{t("settings.agents.type")}</TableHead>
								<TableHead>{t("settings.agents.status")}</TableHead>
								<TableHead>{t("settings.agents.lastUsed")}</TableHead>
								<TableHead>{t("settings.agents.expires")}</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{(agents.data ?? []).map((agent) => {
								const disabled = agent.disabledAt !== null;
								return (
									<TableRow key={agent.id}>
										<TableCell>{agent.name}</TableCell>
										<TableCell>
											<Badge variant="secondary">
												{t(`settings.agents.types.${agent.type}`)}
											</Badge>
										</TableCell>
										<TableCell>
											<Badge variant={disabled ? "outline" : "default"}>
												{disabled
													? t("settings.agents.statusDisabled")
													: t("settings.agents.statusActive")}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{agent.token?.lastUsedAt
												? formatTimestamp(
														agent.token.lastUsedAt,
														i18n.language,
														timezone,
														{ now: today },
													)
												: t("settings.agents.never")}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{agent.token?.expiresAt
												? formatInstantDate(
														agent.token.expiresAt,
														i18n.language,
														timezone,
														{ now: today },
													)
												: t("settings.agents.noExpiry")}
										</TableCell>
										<TableCell className="text-right">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														aria-label={t("settings.agents.actions")}
													>
														<MoreHorizontalIcon />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														onClick={() => rotateMutation.mutate(agent)}
														disabled={agent.token === null}
													>
														<KeyRoundIcon />
														{t("settings.agents.regenerateAction")}
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() =>
															updateMutation.mutate({
																id: agent.id,
																disabled: !disabled,
															})
														}
													>
														{disabled ? <CirclePlayIcon /> : <BanIcon />}
														{disabled
															? t("settings.agents.enableAction")
															: t("settings.agents.disableAction")}
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														variant="destructive"
														onClick={() => setDeleting(agent)}
													>
														<Trash2Icon />
														{t("settings.agents.deleteAction")}
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>

			{formOpen && (
				<AgentFormDialog
					onOpenChange={(open) => {
						if (!open) setFormOpen(false);
					}}
					onCreated={async (created) => {
						setFormOpen(false);
						await invalidateAgents();
						setIssued(created);
					}}
				/>
			)}

			<SecretDialog issued={issued} onClose={() => setIssued(null)} />

			<AlertDialog
				open={deleting !== null}
				onOpenChange={(open) => !open && setDeleting(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("settings.agents.deleteConfirmTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("settings.agents.deleteConfirmDescription", {
								name: deleting?.name ?? "",
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("settings.cancelAction")}</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({ variant: "destructive" })}
							disabled={deleteMutation.isPending}
							onClick={() => deleting && deleteMutation.mutate(deleting.id)}
						>
							{t("settings.agents.deleteAction")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}

/** The mockup's registration dialog: one token is issued on creation. */
function AgentFormDialog({
	onOpenChange,
	onCreated,
}: {
	onOpenChange: (open: boolean) => void;
	onCreated: (issued: IssuedSecret) => void;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [type, setType] = useState<AgentType>("claude_code");
	const [expiresInDays, setExpiresInDays] = useState("");
	const [error, setError] = useState<string | null>(null);

	const createMutation = useMutation({
		mutationFn: () =>
			api.createAgent({
				type,
				name,
				expiresInDays: expiresInDays === "" ? undefined : Number(expiresInDays),
			}),
		onSuccess: (created) => {
			onCreated({
				agentName: created.name,
				secret: created.secret,
			});
		},
		onError: (err: Error) => setError(err.message),
	});

	const onCreate = (e: React.FormEvent) => {
		e.preventDefault();
		createMutation.mutate();
	};

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>{t("settings.agents.createTitle")}</DialogTitle>
					<DialogDescription>
						{t("settings.agents.createDescription")}
					</DialogDescription>
				</DialogHeader>
				<form className="grid gap-5 sm:grid-cols-2" onSubmit={onCreate}>
					<div className="flex flex-col gap-2">
						<Label htmlFor="agent-name">{t("settings.agents.name")}</Label>
						<Input
							id="agent-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder={t("settings.agents.namePlaceholder")}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="agent-type">{t("settings.agents.type")}</Label>
						<Select value={type} onValueChange={(v) => setType(v as AgentType)}>
							<SelectTrigger id="agent-type" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{agentTypes.map((value) => (
									<SelectItem key={value} value={value}>
										{t(`settings.agents.types.${value}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="agent-expiry">
							{t("settings.agents.expiresInDays")}
						</Label>
						<Input
							id="agent-expiry"
							type="number"
							min={1}
							max={3650}
							value={expiresInDays}
							onChange={(e) => setExpiresInDays(e.target.value)}
							placeholder={t("settings.agents.noExpiry")}
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
						<Button type="submit" disabled={createMutation.isPending}>
							{t("settings.agents.createAction")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** Shows a freshly issued token secret once, with a copy affordance. */
function SecretDialog({
	issued,
	onClose,
}: {
	issued: IssuedSecret | null;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);

	return (
		<Dialog
			open={issued !== null}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
					setCopied(false);
				}
			}}
		>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>{t("settings.agents.secretTitle")}</DialogTitle>
					<DialogDescription>
						{t("settings.agents.secretDescription", {
							name: issued?.agentName ?? "",
						})}
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-center gap-2">
					<code className="bg-muted flex-1 overflow-x-auto rounded-md p-2 text-xs">
						{issued?.secret}
					</code>
					<Button
						variant="outline"
						size="icon"
						aria-label={t("settings.agents.copyAction")}
						onClick={async () => {
							if (issued) {
								await navigator.clipboard.writeText(issued.secret);
								setCopied(true);
							}
						}}
					>
						{copied ? <CheckIcon /> : <CopyIcon />}
					</Button>
				</div>
				<DialogFooter>
					<Button
						onClick={() => {
							onClose();
							setCopied(false);
						}}
					>
						{t("settings.agents.doneAction")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
