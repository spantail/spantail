import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type Comment,
	REACTION_EMOJIS,
	type ReactionEmoji,
	type ReactionSummary,
} from "@toxil/core";
import { MoreHorizontalIcon, SmilePlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
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
}: {
	reactions: ReactionSummary[];
	onToggle: (emoji: ReactionEmoji) => void;
	disabled: boolean;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const reactedLabel = (emoji: ReactionEmoji) =>
		t(`discussion.emoji.${EMOJI_LABEL_KEY[emoji]}`);

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{reactions.map((reaction) => (
				<Tooltip key={reaction.emoji}>
					<TooltipTrigger asChild>
						<button
							type="button"
							disabled={disabled}
							onClick={() => onToggle(reaction.emoji)}
							aria-label={reactedLabel(reaction.emoji)}
							aria-pressed={reaction.reactedByMe}
							className={cn(
								"flex h-7 items-center gap-1 rounded-full border px-2 text-sm tabular-nums transition-colors",
								reaction.reactedByMe
									? "border-primary/40 bg-primary/10 text-foreground"
									: "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
							)}
						>
							<span aria-hidden>{EMOJI_GLYPH[reaction.emoji]}</span>
							<span className="text-xs">{reaction.count}</span>
						</button>
					</TooltipTrigger>
					<TooltipContent>{reaction.userNames.join(", ")}</TooltipContent>
				</Tooltip>
			))}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						disabled={disabled}
						aria-label={t("discussion.addReaction")}
						className="text-muted-foreground size-7 rounded-full"
					>
						<SmilePlusIcon />
					</Button>
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
										"flex size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-muted",
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

/** A markdown editor with a Write/Preview toggle, reused for new + edit. */
function CommentEditor({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const { t } = useTranslation();
	return (
		<Tabs defaultValue="write" className="gap-2">
			<TabsList>
				<TabsTrigger value="write">
					{t("discussion.composer.write")}
				</TabsTrigger>
				<TabsTrigger value="preview">
					{t("discussion.composer.preview")}
				</TabsTrigger>
			</TabsList>
			<TabsContent value="write">
				<Textarea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={t("discussion.composer.placeholder")}
					className="min-h-24"
				/>
			</TabsContent>
			<TabsContent value="preview">
				<div className="min-h-24 rounded-md border px-3 py-2">
					{value.trim() === "" ? (
						<p className="text-muted-foreground text-sm">
							{t("discussion.composer.previewEmpty")}
						</p>
					) : (
						<MarkdownView markdown={value} />
					)}
				</div>
			</TabsContent>
		</Tabs>
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
					<span className="text-sm font-medium">{comment.authorName}</span>
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
					<div className="mt-2 flex flex-col gap-2">
						<CommentEditor value={draft} onChange={setDraft} />
						<div className="flex justify-end gap-2">
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
								onClick={() => updateMutation.mutate(draft.trim())}
							>
								{t("discussion.editSave")}
							</Button>
						</div>
					</div>
				) : (
					<div className="mt-1">
						<MarkdownView markdown={comment.body} />
					</div>
				)}

				<div className="mt-2">
					<ReactionBar
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
		<div className="flex flex-col gap-4">
			<Separator />
			<ReactionBar
				reactions={data.reactions}
				onToggle={(emoji) => bodyReactionMutation.mutate(emoji)}
				disabled={bodyReactionMutation.isPending}
			/>

			<h3 className="text-sm font-semibold">
				{t("discussion.commentsHeading", { count: data.comments.length })}
			</h3>

			{data.comments.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("discussion.empty")}</p>
			) : (
				<div className="flex flex-col gap-5">
					{data.comments.map((comment) => (
						<CommentItem
							key={comment.id}
							reportId={reportId}
							comment={comment}
						/>
					))}
				</div>
			)}

			<div className="flex flex-col gap-2">
				<CommentEditor value={draft} onChange={setDraft} />
				<div className="flex items-center justify-between gap-2">
					<span className="text-muted-foreground text-xs">
						{t("discussion.composer.markdownHint")}
					</span>
					<Button
						size="sm"
						disabled={draft.trim() === "" || addMutation.isPending}
						onClick={() => addMutation.mutate(draft.trim())}
					>
						{t("discussion.composer.submit")}
					</Button>
				</div>
			</div>
		</div>
	);
}
