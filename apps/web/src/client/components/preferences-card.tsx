import { CheckIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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

export function PreferencesCard() {
	const { t, i18n } = useTranslation();
	const { theme, setTheme } = useTheme();
	// next-themes resolves the stored theme only after mount; render a stable
	// value until then to avoid a hydration/control mismatch.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.preferences.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.preferences.description")}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex max-w-md flex-col gap-6">
				<div className="flex flex-col gap-2">
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
				<div className="flex flex-col gap-2">
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
										<div className="flex h-14 overflow-hidden rounded-lg border border-border">
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
