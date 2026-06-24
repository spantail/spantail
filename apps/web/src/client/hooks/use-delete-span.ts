import type { WorkSpan } from "@spantail/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { invalidateSpanData } from "@/lib/query";

/** Deletes a work span, refreshes affected lists, and notifies on success. */
export function useDeleteWorkSpan(span: WorkSpan, onSuccess?: () => void) {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		mutationFn: () => api.deleteWorkSpan(span.id),
		onSuccess: () => {
			invalidateSpanData(queryClient, span.workspaceId);
			toast.success(t("spans.toast.deleted"));
			onSuccess?.();
		},
	});
}
