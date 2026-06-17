import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TokenScope } from "@toxil/core";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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

const ALL_SCOPES: TokenScope[] = ["read", "write", "admin"];

export function TokensCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [scopes, setScopes] = useState<TokenScope[]>(["read", "write"]);
	const [expiresInDays, setExpiresInDays] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [createdToken, setCreatedToken] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const tokens = useQuery({
		queryKey: ["tokens"],
		queryFn: () => api.listTokens(),
	});

	const createMutation = useMutation({
		mutationFn: () =>
			api.createToken({
				name,
				scopes,
				expiresInDays: expiresInDays === "" ? undefined : Number(expiresInDays),
			}),
		onSuccess: async (created) => {
			await queryClient.invalidateQueries({ queryKey: ["tokens"] });
			setCreatedToken(created.token);
			setCopied(false);
			setName("");
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteToken(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tokens"] }),
	});

	function toggleScope(scope: TokenScope, checked: boolean) {
		setScopes((prev) =>
			checked ? [...prev, scope] : prev.filter((s) => s !== scope),
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.tokens.title")}
				</CardTitle>
				<CardDescription>{t("settings.tokens.description")}</CardDescription>
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
						<Label htmlFor="token-name">{t("settings.tokens.name")}</Label>
						<Input
							id="token-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder={t("settings.tokens.namePlaceholder")}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>{t("settings.tokens.scopes")}</Label>
						<div className="flex h-9 items-center gap-4">
							{ALL_SCOPES.map((scope) => (
								<div key={scope} className="flex items-center gap-1.5">
									<Checkbox
										id={`token-scope-${scope}`}
										checked={scopes.includes(scope)}
										onCheckedChange={(checked) =>
											toggleScope(scope, checked === true)
										}
									/>
									<Label
										htmlFor={`token-scope-${scope}`}
										className="text-sm font-normal"
									>
										{scope}
									</Label>
								</div>
							))}
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="token-expiry">
							{t("settings.tokens.expiresInDays")}
						</Label>
						<Input
							id="token-expiry"
							type="number"
							min={1}
							max={3650}
							value={expiresInDays}
							onChange={(e) => setExpiresInDays(e.target.value)}
							placeholder={t("settings.tokens.noExpiry")}
						/>
					</div>
					{error && (
						<p className="text-destructive text-sm sm:col-span-3">{error}</p>
					)}
					<div className="sm:col-span-3">
						<Button
							type="submit"
							disabled={createMutation.isPending || scopes.length === 0}
						>
							{t("settings.tokens.createAction")}
						</Button>
					</div>
				</form>

				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("settings.tokens.name")}</TableHead>
							<TableHead>{t("settings.tokens.scopes")}</TableHead>
							<TableHead>{t("settings.tokens.lastUsed")}</TableHead>
							<TableHead>{t("settings.tokens.expires")}</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{(tokens.data ?? []).map((token) => (
							<TableRow key={token.id}>
								<TableCell>{token.name}</TableCell>
								<TableCell className="flex gap-1">
									{token.scopes.map((scope) => (
										<Badge key={scope} variant="secondary">
											{scope}
										</Badge>
									))}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{token.lastUsedAt
										? new Date(token.lastUsedAt).toLocaleString()
										: t("settings.tokens.never")}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{token.expiresAt
										? new Date(token.expiresAt).toLocaleDateString()
										: t("settings.tokens.noExpiry")}
								</TableCell>
								<TableCell className="text-right">
									<Button
										variant="ghost"
										size="sm"
										onClick={() => deleteMutation.mutate(token.id)}
									>
										{t("settings.tokens.revokeAction")}
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>

			<Dialog
				open={createdToken !== null}
				onOpenChange={(open) => !open && setCreatedToken(null)}
			>
				<DialogContent size="lg">
					<DialogHeader>
						<DialogTitle>{t("settings.tokens.createdTitle")}</DialogTitle>
						<DialogDescription>
							{t("settings.tokens.createdDescription")}
						</DialogDescription>
					</DialogHeader>
					<div className="flex items-center gap-2">
						<code className="bg-muted flex-1 overflow-x-auto rounded-md p-2 text-xs">
							{createdToken}
						</code>
						<Button
							variant="outline"
							size="icon"
							aria-label={t("settings.tokens.copyAction")}
							onClick={async () => {
								if (createdToken) {
									await navigator.clipboard.writeText(createdToken);
									setCopied(true);
								}
							}}
						>
							{copied ? <CheckIcon /> : <CopyIcon />}
						</Button>
					</div>
					{copied && (
						<p className="text-muted-foreground text-sm">
							{t("settings.tokens.copied")}
						</p>
					)}
					<DialogFooter>
						<DialogClose asChild>
							<Button>{t("settings.tokens.doneAction")}</Button>
						</DialogClose>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
