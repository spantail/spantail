import type { WorkspaceAccentColor } from "@spantail/core";
import type { Me } from "@spantail/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

// Accent swatches. Colors are inline OKLCH so each tile renders its hue
// regardless of the active workspace theme. "neutral" is the achromatic
// default and spans the full row. `lightSwatch` flags tiles light enough to
// need a dark check mark.
const ACCENTS: ReadonlyArray<{
	id: WorkspaceAccentColor;
	swatch: string;
	full?: boolean;
	lightSwatch?: boolean;
}> = [
	{ id: "neutral", swatch: "oklch(0.55 0 0)", full: true },
	{ id: "red", swatch: "oklch(0.58 0.19 25)" },
	{ id: "orange", swatch: "oklch(0.65 0.16 55)" },
	{ id: "amber", swatch: "oklch(0.7 0.14 90)", lightSwatch: true },
	{ id: "green", swatch: "oklch(0.6 0.15 150)" },
	{ id: "teal", swatch: "oklch(0.6 0.1 195)" },
	{ id: "blue", swatch: "oklch(0.55 0.16 250)" },
	{ id: "violet", swatch: "oklch(0.55 0.18 295)" },
	{ id: "pink", swatch: "oklch(0.6 0.18 345)" },
];

// Abstract preview decoration: a bar silhouette tinted with the live --brand.
const PREVIEW_BARS = [44, 70, 52, 84, 60, 30, 26, 76, 58, 90, 64, 48];
const PREVIEW_DIM = new Set([5, 6]);

export function AppearanceCard() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const canManage = current?.role === "owner" || current?.role === "admin";

	if (!current) {
		return (
			<p className="text-muted-foreground text-sm">{t("workspace.none")}</p>
		);
	}

	if (!canManage) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{t("settings.appearance.title")}
					</CardTitle>
					<CardDescription>{t("settings.adminOnlyHint")}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return <EditAppearanceCard key={current.id} />;
}

function EditAppearanceCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { current } = useWorkspace();
	const selected = current?.accentColor ?? "neutral";

	const mutation = useMutation({
		mutationFn: (accentColor: WorkspaceAccentColor) => {
			if (!current) throw new Error("no workspace");
			return api.updateWorkspace(current.id, { accentColor });
		},
		// Optimistically patch the cached workspace so the provider re-applies the
		// accent immediately (instant preview). Roll back on error and reconcile
		// with the server on settle. The provider stays the single source of truth
		// for the document theme, so a failed request never leaves a stale accent
		// applied — even if the active workspace changed while it was in flight.
		onMutate: async (accentColor) => {
			if (!current) return;
			await queryClient.cancelQueries({ queryKey: ["me"] });
			const previous = queryClient.getQueryData<Me>(["me"]);
			queryClient.setQueryData<Me>(["me"], (old) =>
				old
					? {
							...old,
							memberships: old.memberships.map((w) =>
								w.id === current.id ? { ...w, accentColor } : w,
							),
						}
					: old,
			);
			return { previous };
		},
		onError: (_err, _accentColor, context) => {
			if (context?.previous) queryClient.setQueryData(["me"], context.previous);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.appearance.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.appearance.description", { name: current?.name ?? "" })}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
					<div className="flex w-full max-w-md flex-col gap-2 lg:w-64 lg:shrink-0">
						<span className="text-sm font-medium">
							{t("settings.appearance.accentLabel")}
						</span>
						<p className="text-muted-foreground -mt-0.5 text-sm">
							{t("settings.appearance.accentDescription")}
						</p>
						<div className="mt-1 grid grid-cols-2 gap-3">
							{ACCENTS.map((accent) => {
								const on = selected === accent.id;
								return (
									<button
										key={accent.id}
										type="button"
										disabled={mutation.isPending}
										onClick={() => mutation.mutate(accent.id)}
										className={cn(
											"flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors",
											accent.full && "col-span-2",
											on
												? "border-foreground ring-foreground ring-1"
												: "border-border hover:border-foreground/40",
										)}
									>
										<span
											className={cn(
												"flex size-7 shrink-0 items-center justify-center rounded-full",
												accent.lightSwatch ? "text-zinc-900" : "text-white",
											)}
											style={{ background: accent.swatch }}
										>
											{on && <CheckIcon className="size-3.5" />}
										</span>
										<span className="truncate text-sm font-medium">
											{t(`settings.appearance.colors.${accent.id}`)}
										</span>
										{accent.full && (
											<span className="text-muted-foreground ml-auto text-xs">
												{t("settings.appearance.default")}
											</span>
										)}
									</button>
								);
							})}
						</div>
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						<span className="text-sm font-medium">
							{t("settings.appearance.preview")}
						</span>
						<div className="border-border bg-muted/30 flex flex-col gap-5 rounded-xl border p-5">
							<div className="flex items-end gap-1.5" style={{ height: 80 }}>
								{PREVIEW_BARS.map((height, i) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
										key={i}
										className="flex-1 rounded-[3px]"
										style={{
											height: `${height}%`,
											background: "var(--brand)",
											opacity: PREVIEW_DIM.has(i) ? 0.4 : 1,
										}}
									/>
								))}
							</div>
							<div className="flex items-center gap-3">
								<span
									className="size-9 shrink-0 rounded-lg"
									style={{ background: "var(--brand)" }}
								/>
								<div className="flex flex-1 flex-col gap-2">
									<div className="bg-foreground/10 h-2.5 w-full rounded-full" />
									<div
										className="h-2.5 w-2/3 rounded-full"
										style={{ background: "var(--brand)", opacity: 0.55 }}
									/>
								</div>
							</div>
							<div className="flex items-center gap-2">
								{[0, 1, 2, 3, 4].map((i) => (
									<span
										key={i}
										className="size-2.5 rounded-full"
										style={{
											background: "var(--brand)",
											opacity: 1 - i * 0.16,
										}}
									/>
								))}
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
