import type { WorkspaceRole } from "@spantail/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PersonAvatar } from "@/components/person-avatar";
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

export const Route = createFileRoute("/settings/_workspace/members")({
	component: MembersSection,
});

function MembersSection() {
	const { t } = useTranslation();
	const { selected, canManage } = useSettingsWorkspace();

	if (!selected) {
		return (
			<p className="text-muted-foreground text-sm">{t("workspace.none")}</p>
		);
	}

	return <MembersCard key={selected.id} canManage={canManage} />;
}

function MembersCard({ canManage }: { canManage: boolean }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { selected } = useSettingsWorkspace();
	const workspaceId = selected?.id ?? "";
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
						className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
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
								<TableCell>
									<span className="flex items-center gap-2.5">
										<PersonAvatar
											name={member.name}
											imageUrl={member.imageUrl}
											size={26}
										/>
										{member.name}
									</span>
								</TableCell>
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
