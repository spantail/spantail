import { type MailFolder, mailFolderSchema } from "@spantail/core";
import {
	createFileRoute,
	Outlet,
	redirect,
	useParams,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { MessageList } from "@/components/message-list";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDocumentTitle } from "@/lib/document-title";

export const Route = createFileRoute("/messages/$folder")({
	beforeLoad: ({ params }) => {
		if (!mailFolderSchema.safeParse(params.folder).success) {
			throw redirect({ to: "/messages/$folder", params: { folder: "inbox" } });
		}
	},
	component: FolderLayout,
});

function FolderLayout() {
	const { t } = useTranslation();
	const folder = Route.useParams().folder as MailFolder;
	// Available only when a message child route is active.
	const selected = useParams({
		strict: false,
		select: (p) => p.messageId,
	}) as string | undefined;
	const isMobile = useIsMobile();

	// The open message sets its own title; only the folder list owns it here.
	useDocumentTitle(selected ? undefined : t(`messages.folder.${folder}`));

	// Mobile: single pane driven by the URL — the list, or the open message.
	if (isMobile) {
		return (
			<div className="h-full min-h-0">
				{selected ? <Outlet /> : <MessageList folder={folder} />}
			</div>
		);
	}

	return (
		<ResizablePanelGroup direction="horizontal" className="h-full">
			<ResizablePanel defaultSize={34} minSize={26} maxSize={48}>
				<MessageList folder={folder} selectedId={selected} />
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel defaultSize={66} className="min-w-0">
				<Outlet />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
