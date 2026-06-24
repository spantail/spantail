import type { MailItem, MailScope, SetMailFlagsInput } from "@spantail/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { invalidateMail } from "@/lib/query";

type FlagTarget = Pick<MailItem, "scope" | "id" | "batchId">;

/** A received item flags by its delivery id; a sent batch by its batch id. */
function flagTarget(item: FlagTarget): { scope: MailScope; targetId: string } {
	return item.scope === "sent"
		? { scope: "sent", targetId: item.batchId }
		: { scope: "received", targetId: item.id };
}

/** Star/archive/trash actions for the mailbox, refreshing all folders on settle. */
export function useMailActions() {
	const queryClient = useQueryClient();
	const flags = useMutation({
		mutationFn: (input: SetMailFlagsInput) => api.setMailFlags(input),
		onSettled: () => invalidateMail(queryClient),
	});

	return {
		pending: flags.isPending,
		setStar: (item: FlagTarget, starred: boolean) =>
			flags.mutate({ ...flagTarget(item), starred }),
		setArchive: (item: FlagTarget, archived: boolean) =>
			flags.mutate({ ...flagTarget(item), archived }),
		setTrash: (item: FlagTarget, trashed: boolean) =>
			flags.mutate({ ...flagTarget(item), trashed }),
	};
}
