import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface InfiniteSentinelProps {
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => void;
}

/** Loads the next page of an infinite query when scrolled into view. */
export function InfiniteSentinel({
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
}: InfiniteSentinelProps) {
	const { t } = useTranslation();
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el || !hasNextPage) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage)
				fetchNextPage();
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	return (
		<div ref={ref} className="h-8">
			{isFetchingNextPage && (
				<p className="text-muted-foreground text-center text-sm">
					{t("app.loadingMore")}
				</p>
			)}
		</div>
	);
}
