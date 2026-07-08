import { QueryClientProvider } from "@tanstack/react-query";
import {
	createRouter,
	type RouterHistory,
	RouterProvider,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import type { CSSProperties } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VersionReloadBanner } from "@/components/version-reload-banner";
import { queryClient } from "@/lib/query";
import { useShowReloadBanner } from "@/lib/server-version";
import { routeTree } from "@/routeTree.gen";

import "./i18n";

export function createAppRouter(options?: { history?: RouterHistory }) {
	return createRouter({ routeTree, history: options?.history });
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}
}

/** The full provider tree; main.tsx mounts it and tests render it as-is. */
export function App({
	router,
}: {
	router: ReturnType<typeof createAppRouter>;
}) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			<QueryClientProvider client={queryClient}>
				<TooltipProvider>
					<AppFrame router={router} />
					<Toaster />
				</TooltipProvider>
			</QueryClientProvider>
		</ThemeProvider>
	);
}

/**
 * Frames the router with the version reload banner. When shown, the banner
 * takes a row at the very top (above the sidebar) and reserves its height via
 * `--app-banner-height`, which the sidebar CSS reads to drop below it
 * (see index.css).
 */
function AppFrame({ router }: { router: ReturnType<typeof createAppRouter> }) {
	const showBanner = useShowReloadBanner();
	return (
		<div
			className="flex min-h-svh flex-col"
			style={
				{
					"--app-banner-height": showBanner ? "2.75rem" : "0px",
				} as CSSProperties
			}
		>
			{showBanner && <VersionReloadBanner />}
			<RouterProvider router={router} />
		</div>
	);
}
