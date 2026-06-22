import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type Comment,
	REACTION_EMOJIS,
	type ReactionEmoji,
	type ReactionSummary,
} from "@toxil/core";
import {
	MessageSquareIcon,
	MoreHorizontalIcon,
	SmilePlusIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownView } from "@/components/markdown-view";
import { PersonAvatar } from "@/components/person-avatar";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatRelativeTime } from "@/lib/format";
import { invalidateReportDiscussion } from "@/lib/query";
import { cn } from "@/lib/utils";

/** Content-key → glyph. Aria labels come from i18n (discussion.emoji.*). */
const EMOJI_GLYPH: Record<ReactionEmoji, string> = {
	"+1": "👍",
	"-1": "👎",
	laugh: "😄",
	hooray: "🎉",
	confused: "😕",
	heart: "❤️",
	rocket: "🚀",
	eyes: "👀",
};

const EMOJI_LABEL_KEY: Record<ReactionEmoji, string> = {
	"+1": "thumbsUp",
	"-1": "thumbsDown",
	laugh: "laugh",
	hooray: "hooray",
	confused: "confused",
	heart: "heart",
	rocket: "rocket",
	eyes: "eyes",
};

/** A reaction bar (existing pills + an add-reaction picker) for one target. */
function ReactionBar({
	reactions,
	onToggle,
	disabled,
	size = "md",
}: {
	reactions: ReactionSummary[];
	onToggle: (emoji: ReactionEmoji) => void;
	disabled: boolean;
	size?: "sm" | "md";
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const reactedLabel = (emoji: ReactionEmoji) =>
		t(`discussion.emoji.${EMOJI_LABEL_KEY[emoji]}`);
	const pillSize = size === "sm" ? "h-7 text-xs" : "h-8 text-sm";
	const triggerSize = size === "sm" ? "size-7" : "size-8";

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{reactions.map((reaction) => (
				<button
					key={reaction.emoji}
					type="button"
					disabled={disabled}
					onClick={() => onToggle(reaction.emoji)}
					aria-label={reactedLabel(reaction.emoji)}
					aria-pressed={reaction.reactedByMe}
					title={reaction.userNames.join(", ")}
					className={cn(
						"inline-flex items-center gap-1.5 rounded-full border px-2.5 font-medium tabular-nums transition-colors",
						pillSize,
						reaction.reactedByMe
							? "border-primary/40 bg-primary/10 text-foreground"
							: "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
					)}
				>
					<span aria-hidden className="leading-none">
						{EMOJI_GLYPH[reaction.emoji]}
					</span>
					<span className="tabular-nums">{reaction.count}</span>
				</button>
			))}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						disabled={disabled}
						aria-label={t("discussion.addReaction")}
						className={cn(
							"text-muted-foreground hover:bg-secondary inline-flex items-center justify-center rounded-full border transition-colors",
							triggerSize,
						)}
					>
						<SmilePlusIcon className={size === "sm" ? "size-3.5" : "size-4"} />
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto p-1.5">
					<div className="flex gap-1">
						{REACTION_EMOJIS.map((emoji) => {
							const active = reactions.find(
								(r) => r.emoji === emoji,
							)?.reactedByMe;
							return (
								<button
									key={emoji}
									type="button"
									onClick={() => {
										onToggle(emoji);
										setOpen(false);
									}}
									aria-label={reactedLabel(emoji)}
									className={cn(
										"hover:bg-accent flex size-8 items-center justify-center rounded-lg text-lg transition-colors",
										active && "bg-primary/10",
									)}
								>
									<span aria-hidden>{EMOJI_GLYPH[emoji]}</span>
								</button>
							);
						})}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}

/**
 * The discussion composer card: the shared MarkdownEditor wired with the
 * discussion's own labels and a footer slot (main composer and inline edits).
 */
function CommentComposer({
	value,
	onChange,
	footer,
}: {
	value: string;
	onChange: (value: string) => void;
	footer: ReactNode;
}) {
	const { t } = useTranslation();
	return (
		<MarkdownEditor
			value={value}
			onChange={onChange}
			labels={{
				write: t("discussion.composer.write"),
				preview: t("discussion.composer.preview"),
			}}
			previewEmpty={t("discussion.composer.previewEmpty")}
			placeholder={t("discussion.composer.placeholder")}
			footer={footer}
		/>
	);
}

function CommentItem({
	reportId,
	comment,
}: {
	reportId: string;
	comment: Comment;
}) {
	const { t, i18n } = useTranslation();
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(comment.body);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const invalidate = () => invalidateReportDiscussion(queryClient, reportId);

	const reactionMutation = useMutation({
		mutationFn: (emoji: ReactionEmoji) =>
			api.toggleReportCommentReaction(reportId, comment.id, emoji),
		onSuccess: invalidate,
	});
	const updateMutation = useMutation({
		mutationFn: (body: string) =>
			api.updateReportComment(reportId, comment.id, body),
		onSuccess: () => {
			setEditing(false);
			invalidate();
		},
	});
	const deleteMutation = useMutation({
		mutationFn: () => api.deleteReportComment(reportId, comment.id),
		onSuccess: invalidate,
	});

	const edited = comment.updatedAt !== comment.createdAt;

	return (
		<div className="flex gap-3">
			<PersonAvatar name={comment.authorName} size={32} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold">{comment.authorName}</span>
					<span className="text-muted-foreground text-xs">
						{formatRelativeTime(comment.createdAt, i18n.language)}
						{edited && ` · ${t("discussion.edited")}`}
					</span>
					{comment.editable && !editing && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									aria-label={t("discussion.commentActions")}
									className="text-muted-foreground ml-auto size-7"
								>
									<MoreHorizontalIcon />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									onSelect={() => {
										setDraft(comment.body);
										setEditing(true);
									}}
								>
									{t("discussion.edit")}
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									onSelect={() => setConfirmDelete(true)}
								>
									{t("discussion.delete")}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>

				{editing ? (
					<div className="mt-2">
						<CommentComposer
							value={draft}
							onChange={setDraft}
							footer={
								<>
									<span className="text-muted-foreground text-xs">
										{t("discussion.composer.markdownHint")}
									</span>
									<div className="flex gap-2">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setEditing(false)}
										>
											{t("discussion.editCancel")}
										</Button>
										<Button
											size="sm"
											disabled={draft.trim() === "" || updateMutation.isPending}
											onClick={() => updateMutation.mutate(draft)}
										>
											{t("discussion.editSave")}
										</Button>
									</div>
								</>
							}
						/>
					</div>
				) : (
					<div className="mt-1">
						<MarkdownView markdown={comment.body} />
					</div>
				)}

				<div className="mt-2">
					<ReactionBar
						size="sm"
						reactions={comment.reactions}
						onToggle={(emoji) => reactionMutation.mutate(emoji)}
						disabled={reactionMutation.isPending}
					/>
				</div>
			</div>

			<AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("discussion.deleteConfirm.title")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("discussion.deleteConfirm.description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{t("discussion.deleteConfirm.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({ variant: "destructive" })}
							onClick={() => deleteMutation.mutate()}
						>
							{t("discussion.deleteConfirm.confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

/**
 * Reactions + Markdown comments for a Send-to-shared report. Shared by the
 * sender (reports view) and recipients (notifications view); both read and
 * write the same report-keyed thread. Renders nothing for an unshared report.
 */
export function ReportDiscussion({ reportId }: { reportId: string }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState("");
	const { data: session } = authClient.useSession();
	const meName = session?.user?.name ?? "?";

	const discussion = useQuery({
		queryKey: ["report-discussion", reportId],
		queryFn: () => api.getReportDiscussion(reportId),
	});

	const invalidate = () => invalidateReportDiscussion(queryClient, reportId);

	const bodyReactionMutation = useMutation({
		mutationFn: (emoji: ReactionEmoji) =>
			api.toggleReportReaction(reportId, emoji),
		onSuccess: invalidate,
	});
	const addMutation = useMutation({
		mutationFn: (body: string) => api.addReportComment(reportId, body),
		onSuccess: () => {
			setDraft("");
			invalidate();
		},
	});

	const data = discussion.data;
	// Hidden until loaded; an unshared report (owner never sent it) has no thread.
	if (!data?.shared) return null;

	return (
		<section className="flex flex-col gap-5">
			<ReactionBar
				reactions={data.reactions}
				onToggle={(emoji) => bodyReactionMutation.mutate(emoji)}
				disabled={bodyReactionMutation.isPending}
			/>

			<div className="flex flex-col gap-5">
				<h3 className="flex items-center gap-2 text-sm font-semibold">
					<MessageSquareIcon className="text-muted-foreground size-4" />
					{data.comments.length === 0
						? t("discussion.empty")
						: t("discussion.commentsHeading", { count: data.comments.length })}
				</h3>

				{data.comments.map((comment) => (
					<CommentItem key={comment.id} reportId={reportId} comment={comment} />
				))}
			</div>

			<div className="flex gap-3">
				<PersonAvatar name={meName} size={32} />
				<CommentComposer
					value={draft}
					onChange={setDraft}
					footer={
						<>
							<span className="text-muted-foreground text-xs">
								{t("discussion.composer.markdownHint")}
							</span>
							<Button
								size="sm"
								disabled={draft.trim() === "" || addMutation.isPending}
								onClick={() => addMutation.mutate(draft)}
							>
								{t("discussion.composer.submit")}
							</Button>
						</>
					}
				/>
			</div>
		</section>
	);
}
