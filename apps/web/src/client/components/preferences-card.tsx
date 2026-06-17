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

// Swatch colours for the theme preview tiles. Inline so the dark tile renders
// its own palette regardless of the active theme.
const THEMES = [
	{
		id: "light",
		labelKey: "settings.preferences.themeLight",
		bg: "#ffffff",
		fg: "#18181b",
		line: "#e4e4e7",
	},
	{
		id: "dark",
		labelKey: "settings.preferences.themeDark",
		bg: "#18181b",
		fg: "#fafafa",
		line: "#3f3f46",
	},
] as const;

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
					<div className="grid grid-cols-2 gap-3">
						{THEMES.map((option) => {
							const current = mounted && theme === "dark" ? "dark" : "light";
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
									<div
										className="flex h-14 items-end gap-1.5 rounded-lg p-2"
										style={{
											background: option.bg,
											border: `1px solid ${option.line}`,
										}}
									>
										<div
											className="h-2 flex-1 rounded-full"
											style={{ background: option.fg, opacity: 0.85 }}
										/>
										<div
											className="h-2 w-4 rounded-full"
											style={{ background: option.fg, opacity: 0.35 }}
										/>
									</div>
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
