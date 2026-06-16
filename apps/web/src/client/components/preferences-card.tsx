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

// Language names are shown in their own script regardless of the active locale,
// so they are constants rather than translated strings.
const LANGUAGES = [
	{ value: "en", label: "English" },
	{ value: "ja", label: "日本語" },
];

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
			<CardContent className="flex max-w-sm flex-col gap-4">
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
					<Label htmlFor="theme-select">
						{t("settings.preferences.theme")}
					</Label>
					<Select
						value={mounted ? (theme === "dark" ? "dark" : "light") : "light"}
						onValueChange={(value) => setTheme(value)}
					>
						<SelectTrigger id="theme-select" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="light">
								{t("settings.preferences.themeLight")}
							</SelectItem>
							<SelectItem value="dark">
								{t("settings.preferences.themeDark")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</CardContent>
		</Card>
	);
}
