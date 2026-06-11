import { QueryClientProvider } from "@tanstack/react-query";
import {
	createRouter,
	type RouterHistory,
	RouterProvider,
} from "@tanstack/react-router";

import { TooltipProvider } from "@/components/ui/tooltip";
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
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				<RouterProvider router={router} />
			</TooltipProvider>
		</QueryClientProvider>
	);
}
