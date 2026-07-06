import type { Me } from "@spantail/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// Avatars are normalized client-side to a small square so storage and transfer
// stay tiny regardless of the source image.
const AVATAR_SIZE = 256;

/** Center-crops to a square and re-encodes as a 256px WebP for upload. */
async function toAvatarBlob(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	try {
		const canvas = document.createElement("canvas");
		canvas.width = AVATAR_SIZE;
		canvas.height = AVATAR_SIZE;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("canvas unsupported");
		const side = Math.min(bitmap.width, bitmap.height);
		const sx = (bitmap.width - side) / 2;
		const sy = (bitmap.height - side) / 2;
		ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
				"image/webp",
				0.85,
			);
		});
	} finally {
		bitmap.close();
	}
}

function ProfilePicture() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const inputRef = useRef<HTMLInputElement>(null);
	const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.me() });

	const onSettled = (updated: Me) => {
		queryClient.setQueryData<Me>(["me"], updated);
		void queryClient.invalidateQueries({ queryKey: ["me"] });
	};

	const uploadMutation = useMutation({
		mutationFn: async (file: File) =>
			api.updateAvatar(await toAvatarBlob(file)),
		onSuccess: (updated) => {
			onSettled(updated);
			toast.success(t("settings.profile.updated"));
		},
		onError: () => toast.error(t("settings.profile.error")),
	});

	const removeMutation = useMutation({
		mutationFn: () => api.removeAvatar(),
		onSuccess: (updated) => {
			onSettled(updated);
			toast.success(t("settings.profile.removed"));
		},
		onError: () => toast.error(t("errors.generic")),
	});

	const busy = uploadMutation.isPending || removeMutation.isPending;
	const user = me?.user;

	function onPick(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// Allow re-selecting the same file later by clearing the input.
		event.target.value = "";
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error(t("settings.profile.error"));
			return;
		}
		uploadMutation.mutate(file);
	}

	return (
		<div className="flex flex-col gap-2">
			<Label>{t("settings.profile.title")}</Label>
			<div className="flex items-center gap-4">
				<PersonAvatar
					name={user?.name ?? "?"}
					imageUrl={user?.imageUrl}
					size={56}
				/>
				<div className="flex flex-col items-start gap-1.5">
					<div className="flex flex-wrap gap-2">
						{/* The mockup's small action buttons: h-8 with text-xs. */}
						<Button
							type="button"
							variant="outline"
							className="px-3 text-xs"
							disabled={busy}
							onClick={() => inputRef.current?.click()}
						>
							{t("settings.profile.uploadAction")}
						</Button>
						{user?.imageUrl && (
							<Button
								type="button"
								variant="ghost"
								className="px-3 text-xs"
								disabled={busy}
								onClick={() => removeMutation.mutate()}
							>
								{t("settings.profile.remove")}
							</Button>
						)}
					</div>
					<p className="text-muted-foreground text-xs">
						{t("settings.profile.hint")}
					</p>
				</div>
				<input
					ref={inputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					className="hidden"
					onChange={onPick}
				/>
			</div>
		</div>
	);
}

function browserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Timezone is per-user, server-persisted state (unlike language/theme, which are
 * client-local) because the server computes local dates on ingest. An empty
 * value clears it back to the UTC fallback.
 */
function TimezonePreference() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
	const saved = me.data?.user.timezone ?? "";
	const [value, setValue] = useState(saved);
	const [error, setError] = useState<string | null>(null);
	// Adopt the saved value once `me` resolves or changes under us.
	useEffect(() => setValue(saved), [saved]);

	const mutation = useMutation({
		mutationFn: (timezone: string | null) =>
			api.updateAccountPreferences({ timezone }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const next = value.trim() === "" ? null : value.trim();
	const dirty = (next ?? "") !== saved;

	return (
		<form
			className="flex max-w-md flex-col gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				mutation.mutate(next);
			}}
		>
			<Label htmlFor="account-tz">{t("settings.preferences.timezone")}</Label>
			<div className="flex gap-2">
				<Input
					id="account-tz"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder={browserTimezone()}
				/>
				<Button
					type="submit"
					variant="outline"
					disabled={!dirty || mutation.isPending}
				>
					{t("settings.saveAction")}
				</Button>
			</div>
			<p className="text-muted-foreground text-xs">
				{t("settings.preferences.timezoneHint")}
			</p>
			{error && <p className="text-destructive text-sm">{error}</p>}
		</form>
	);
}

// Language names are shown in their own script regardless of the active locale,
// so they are constants rather than translated strings.
const LANGUAGES = [
	{ value: "en", label: "English" },
	{ value: "ja", label: "日本語" },
];

// Swatch colours for the theme preview tiles. Inline so each tile renders its
// own palette regardless of the active theme. The system tile splits into both.
const LIGHT = { bg: "#ffffff", fg: "#18181b", line: "#e4e4e7" } as const;
const DARK = { bg: "#18181b", fg: "#fafafa", line: "#3f3f46" } as const;

const THEMES = [
	{ id: "system", labelKey: "settings.preferences.themeSystem", split: true },
	{ id: "light", labelKey: "settings.preferences.themeLight", ...LIGHT },
	{ id: "dark", labelKey: "settings.preferences.themeDark", ...DARK },
] as const;

// The bottom-anchored bars of a swatch tile (or one half of the system tile).
function SwatchBars({
	bg,
	fg,
	className,
}: {
	bg: string;
	fg: string;
	className?: string;
}) {
	return (
		<div
			className={cn("flex h-full items-end gap-1.5 p-2", className)}
			style={{ background: bg }}
		>
			<div
				className="h-2 flex-1 rounded-full"
				style={{ background: fg, opacity: 0.85 }}
			/>
			<div
				className="h-2 w-4 rounded-full"
				style={{ background: fg, opacity: 0.35 }}
			/>
		</div>
	);
}

// One panel for everything user-scoped — profile picture, language, timezone
// and theme — per the design mockup. The section header carries the title, so
// the card has no header of its own.
export function PreferencesCard() {
	const { t, i18n } = useTranslation();
	const { theme, setTheme } = useTheme();
	// next-themes resolves the stored theme only after mount; render a stable
	// value until then to avoid a hydration/control mismatch.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	return (
		<Card>
			<CardContent className="flex flex-col gap-6">
				<ProfilePicture />
				<div className="flex max-w-md flex-col gap-2">
					<Label htmlFor="language-select">
						{t("settings.preferences.language")}
					</Label>
					<Select
						value={i18n.language.startsWith("ja") ? "ja" : "en"}
						onValueChange={(value) => i18n.changeLanguage(value)}
					>
						<SelectTrigger id="language-select" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{LANGUAGES.map((lang) => (
								<SelectItem key={lang.value} value={lang.value}>
									{lang.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<TimezonePreference />
				<div className="flex max-w-md flex-col gap-2">
					<Label>{t("settings.preferences.theme")}</Label>
					<div className="grid grid-cols-3 gap-3">
						{THEMES.map((option) => {
							const current = mounted ? theme : undefined;
							const selected = current === option.id;
							return (
								<button
									key={option.id}
									type="button"
									onClick={() => setTheme(option.id)}
									className={cn(
										"flex flex-col gap-2.5 rounded-xl border p-3 text-left transition-colors",
										selected
											? "border-foreground ring-foreground ring-1"
											: "border-border hover:border-foreground/40",
									)}
								>
									{"split" in option ? (
										<div className="border-border flex h-14 overflow-hidden rounded-lg border">
											<SwatchBars
												className="flex-1"
												bg={LIGHT.bg}
												fg={LIGHT.fg}
											/>
											<SwatchBars
												className="flex-1"
												bg={DARK.bg}
												fg={DARK.fg}
											/>
										</div>
									) : (
										<div
											className="h-14 overflow-hidden rounded-lg"
											style={{ border: `1px solid ${option.line}` }}
										>
											<SwatchBars bg={option.bg} fg={option.fg} />
										</div>
									)}
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">
											{t(option.labelKey)}
										</span>
										<span
											className={cn(
												"flex size-4 items-center justify-center rounded-full border transition-colors",
												selected
													? "border-foreground bg-foreground text-background"
													: "border-input",
											)}
										>
											{selected && <CheckIcon className="size-[11px]" />}
										</span>
									</div>
								</button>
							);
						})}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
