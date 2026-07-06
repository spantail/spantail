/**
 * Content chrome shared by every settings section: a fixed h-14 header with
 * the section title (plus optional context and actions) above a scrollable,
 * width-capped body. Workspace-scoped sections get it from the `_workspace`
 * layout; the other sections wrap themselves in it.
 */
export function SettingsSection({
	title,
	meta,
	actions,
	children,
}: {
	title: string;
	/** Secondary context after the title, e.g. the selected workspace's name. */
	meta?: string;
	/** Right-aligned header controls, e.g. the mobile workspace picker. */
	actions?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
			<div className="border-border flex h-14 shrink-0 items-center gap-2 border-b px-4 md:px-6">
				<h1 className="shrink-0 text-sm font-semibold">{title}</h1>
				{meta && (
					<span className="hidden min-w-0 items-center gap-2 md:flex">
						<span className="text-muted-foreground/50">·</span>
						<span className="text-muted-foreground truncate text-sm">
							{meta}
						</span>
					</span>
				)}
				{actions && <div className="ml-auto flex items-center">{actions}</div>}
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
					{children}
				</div>
			</div>
		</section>
	);
}
