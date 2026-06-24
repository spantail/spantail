import type { Me } from "@spantail/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";

// Avatars are normalized client-side to a small square so storage and transfer
// stay tiny regardless of the source image.
const AVATAR_SIZE = 256;

/** Center-crops to a square and re-encodes as a 256px WebP for upload. */
async function toAvatarBlob(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	try {
		const canvas = document.createElement("canvas");
		canvas.width = AVATAR_SIZE;
		canvas.height = AVATAR_SIZE;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("canvas unsupported");
		const side = Math.min(bitmap.width, bitmap.height);
		const sx = (bitmap.width - side) / 2;
		const sy = (bitmap.height - side) / 2;
		ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
				"image/webp",
				0.85,
			);
		});
	} finally {
		bitmap.close();
	}
}

export function AvatarCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const inputRef = useRef<HTMLInputElement>(null);
	const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.me() });

	const onSettled = (updated: Me) => {
		queryClient.setQueryData<Me>(["me"], updated);
		void queryClient.invalidateQueries({ queryKey: ["me"] });
	};

	const uploadMutation = useMutation({
		mutationFn: async (file: File) =>
			api.updateAvatar(await toAvatarBlob(file)),
		onSuccess: (updated) => {
			onSettled(updated);
			toast.success(t("settings.profile.updated"));
		},
		onError: () => toast.error(t("settings.profile.error")),
	});

	const removeMutation = useMutation({
		mutationFn: () => api.removeAvatar(),
		onSuccess: (updated) => {
			onSettled(updated);
			toast.success(t("settings.profile.removed"));
		},
		onError: () => toast.error(t("errors.generic")),
	});

	const busy = uploadMutation.isPending || removeMutation.isPending;
	const user = me?.user;

	function onPick(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// Allow re-selecting the same file later by clearing the input.
		event.target.value = "";
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error(t("settings.profile.error"));
			return;
		}
		uploadMutation.mutate(file);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.profile.title")}
				</CardTitle>
				<CardDescription>{t("settings.profile.description")}</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex items-center gap-4">
					<PersonAvatar
						name={user?.name ?? "?"}
						imageUrl={user?.imageUrl}
						size={64}
					/>
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() => inputRef.current?.click()}
							>
								{t("settings.profile.uploadAction")}
							</Button>
							{user?.imageUrl && (
								<Button
									type="button"
									variant="ghost"
									disabled={busy}
									onClick={() => removeMutation.mutate()}
								>
									{t("settings.profile.remove")}
								</Button>
							)}
						</div>
						<p className="text-muted-foreground text-xs">
							{t("settings.profile.hint")}
						</p>
					</div>
					<input
						ref={inputRef}
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						className="hidden"
						onChange={onPick}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
