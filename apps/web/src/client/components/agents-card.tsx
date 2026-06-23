import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, AgentType } from "@toxil/core";
import { CheckIcon, CopyIcon } from "lucide-react";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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

const AGENT_TYPES: AgentType[] = ["claude_code", "codex", "cursor", "other"];
const NONE = "none";

export function AgentsCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [type, setType] = useState<AgentType>("claude_code");
	const [error, setError] = useState<string | null>(null);
	const [tokenAgent, setTokenAgent] = useState<Agent | null>(null);

	const agents = useQuery({
		queryKey: ["agents"],
		queryFn: () => api.listAgents(),
	});

	const createMutation = useMutation({
		mutationFn: () => api.createAgent({ type, name }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["agents"] });
			setName("");
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteAgent(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.agents.title")}
				</CardTitle>
				<CardDescription>{t("settings.agents.description")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<form
					className="grid gap-4 sm:grid-cols-3"
					onSubmit={(e) => {
						e.preventDefault();
						createMutation.mutate();
					}}
				>
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
								{AGENT_TYPES.map((value) => (
									<SelectItem key={value} value={value}>
										{t(`settings.agents.types.${value}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{error && (
						<p className="text-destructive text-sm sm:col-span-3">{error}</p>
					)}
					<div className="flex items-end sm:col-span-3">
						<Button type="submit" disabled={createMutation.isPending}>
							{t("settings.agents.createAction")}
						</Button>
					</div>
				</form>

				{(agents.data ?? []).length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("settings.agents.empty")}
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("settings.agents.name")}</TableHead>
								<TableHead>{t("settings.agents.type")}</TableHead>
								<TableHead>{t("settings.agents.created")}</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{(agents.data ?? []).map((agent) => (
								<TableRow key={agent.id}>
									<TableCell>{agent.name}</TableCell>
									<TableCell>
										<Badge variant="secondary">
											{t(`settings.agents.types.${agent.type}`)}
										</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{new Date(agent.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell className="flex justify-end gap-1">
										<Button
											variant="outline"
											size="sm"
											onClick={() => setTokenAgent(agent)}
										>
											{t("settings.agents.tokens.manageAction")}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => deleteMutation.mutate(agent.id)}
										>
											{t("settings.agents.deleteAction")}
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>

			{tokenAgent && (
				<AgentTokensDialog
					agent={tokenAgent}
					onClose={() => setTokenAgent(null)}
				/>
			)}
		</Card>
	);
}

function AgentTokensDialog({
	agent,
	onClose,
}: {
	agent: Agent;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [workspaceId, setWorkspaceId] = useState(NONE);
	const [projectId, setProjectId] = useState(NONE);
	const [expiresInDays, setExpiresInDays] = useState("");
	const [createdToken, setCreatedToken] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const workspaces = useQuery({
		queryKey: ["workspaces"],
		queryFn: () => api.listWorkspaces(),
	});
	const projects = useQuery({
		queryKey: ["projects", workspaceId],
		queryFn: () => api.listProjects(workspaceId),
		enabled: workspaceId !== NONE,
	});
	const tokens = useQuery({
		queryKey: ["agentTokens", agent.id],
		queryFn: () => api.listAgentTokens(agent.id),
	});

	const createMutation = useMutation({
		mutationFn: () =>
			api.createAgentToken(agent.id, {
				name,
				defaultWorkspaceId: workspaceId === NONE ? undefined : workspaceId,
				defaultProjectId: projectId === NONE ? undefined : projectId,
				expiresInDays: expiresInDays === "" ? undefined : Number(expiresInDays),
			}),
		onSuccess: async (created) => {
			await queryClient.invalidateQueries({
				queryKey: ["agentTokens", agent.id],
			});
			setCreatedToken(created.token);
			setCopied(false);
			setName("");
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteAgentToken(agent.id, id),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["agentTokens", agent.id] }),
	});

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>
						{t("settings.agents.tokens.title", { name: agent.name })}
					</DialogTitle>
					<DialogDescription>
						{t("settings.agents.tokens.description")}
					</DialogDescription>
				</DialogHeader>

				<form
					className="grid gap-4 sm:grid-cols-2"
					onSubmit={(e) => {
						e.preventDefault();
						createMutation.mutate();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="agent-token-name">
							{t("settings.agents.tokens.name")}
						</Label>
						<Input
							id="agent-token-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder={t("settings.agents.tokens.namePlaceholder")}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="agent-token-expiry">
							{t("settings.agents.tokens.expiresInDays")}
						</Label>
						<Input
							id="agent-token-expiry"
							type="number"
							min={1}
							max={3650}
							value={expiresInDays}
							onChange={(e) => setExpiresInDays(e.target.value)}
							placeholder={t("settings.agents.tokens.noExpiry")}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>{t("settings.agents.tokens.defaultWorkspace")}</Label>
						<Select
							value={workspaceId}
							onValueChange={(v) => {
								setWorkspaceId(v);
								setProjectId(NONE);
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>
									{t("settings.agents.tokens.none")}
								</SelectItem>
								{(workspaces.data ?? []).map((ws) => (
									<SelectItem key={ws.id} value={ws.id}>
										{ws.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-2">
						<Label>{t("settings.agents.tokens.defaultProject")}</Label>
						<Select
							value={projectId}
							onValueChange={setProjectId}
							disabled={workspaceId === NONE}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>
									{t("settings.agents.tokens.none")}
								</SelectItem>
								{(projects.data ?? []).map((project) => (
									<SelectItem key={project.id} value={project.id}>
										{project.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{error && (
						<p className="text-destructive text-sm sm:col-span-2">{error}</p>
					)}
					<div className="sm:col-span-2">
						<Button type="submit" disabled={createMutation.isPending}>
							{t("settings.agents.tokens.createAction")}
						</Button>
					</div>
				</form>

				{createdToken && (
					<div className="flex flex-col gap-2">
						<p className="text-muted-foreground text-sm">
							{t("settings.agents.tokens.createdDescription")}
						</p>
						<div className="flex items-center gap-2">
							<code className="bg-muted flex-1 overflow-x-auto rounded-md p-2 text-xs">
								{createdToken}
							</code>
							<Button
								variant="outline"
								size="icon"
								aria-label={t("settings.agents.tokens.copyAction")}
								onClick={async () => {
									await navigator.clipboard.writeText(createdToken);
									setCopied(true);
								}}
							>
								{copied ? <CheckIcon /> : <CopyIcon />}
							</Button>
						</div>
						{copied && (
							<p className="text-muted-foreground text-sm">
								{t("settings.agents.tokens.copied")}
							</p>
						)}
					</div>
				)}

				{(tokens.data ?? []).length > 0 && (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("settings.agents.tokens.name")}</TableHead>
								<TableHead>{t("settings.agents.tokens.lastUsed")}</TableHead>
								<TableHead>{t("settings.agents.tokens.expires")}</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{(tokens.data ?? []).map((token) => (
								<TableRow key={token.id}>
									<TableCell>{token.name}</TableCell>
									<TableCell className="text-muted-foreground">
										{token.lastUsedAt
											? new Date(token.lastUsedAt).toLocaleString()
											: t("settings.agents.tokens.never")}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{token.expiresAt
											? new Date(token.expiresAt).toLocaleDateString()
											: t("settings.agents.tokens.noExpiry")}
									</TableCell>
									<TableCell className="text-right">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => deleteMutation.mutate(token.id)}
										>
											{t("settings.agents.tokens.revokeAction")}
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</DialogContent>
		</Dialog>
	);
}
