import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkEntry } from "@toxil/core";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { invalidateWorkEntryData } from "@/lib/query";

/** Deletes a work entry, refreshes affected lists, and notifies on success. */
export function useDeleteWorkEntry(entry: WorkEntry, onSuccess?: () => void) {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		mutationFn: () => api.deleteWorkEntry(entry.id),
		onSuccess: () => {
			invalidateWorkEntryData(queryClient, entry.workspaceId);
			toast.success(t("entries.toast.deleted"));
			onSuccess?.();
		},
	});
}
