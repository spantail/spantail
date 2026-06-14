import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

/** Light/dark toggle. Lives in the header, beside the user-scoped controls. */
export function ModeToggle() {
	const { t } = useTranslation();
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<Button
			variant="ghost"
			size="icon"
			className="text-muted-foreground"
			onClick={() => setTheme(isDark ? "light" : "dark")}
			aria-label={t(isDark ? "theme.toLight" : "theme.toDark")}
		>
			{isDark ? <SunIcon /> : <MoonIcon />}
		</Button>
	);
}
