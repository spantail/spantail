import { QueryClientProvider } from "@tanstack/react-query";
import {
	createRouter,
	type RouterHistory,
	RouterProvider,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VersionReloadBanner } from "@/components/version-reload-banner";
import { queryClient } from "@/lib/query";
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
					{/* In normal flow above every route so, when shown, it pushes the
					    shell down rather than covering it; renders nothing otherwise. */}
					<VersionReloadBanner />
					<RouterProvider router={router} />
					<Toaster />
				</TooltipProvider>
			</QueryClientProvider>
		</ThemeProvider>
	);
}
