import { type CreateReportShareInput, hashSharePasscode } from "@spantail/core";
import type { ReportShareRow } from "@spantail/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * API shape of a share. Internal fields never leave the server: the passcode
 * hash is replaced by a boolean, and the minting user is dropped (every
 * listing is already scoped to the caller's own shares).
 */
export function toApiShare(row: ReportShareRow) {
	const { passcodeHash, createdByUserId: _createdByUserId, ...rest } = row;
	return { ...rest, hasPasscode: passcodeHash !== null };
}

/**
 * Resolves the user-supplied share options into row values — shared by the two
 * mint paths (the owner's report screen and a recipient's inbox message).
 */
export async function shareAttributesFromInput(
	input: CreateReportShareInput,
): Promise<{ passcodeHash: string | null; expiresAt: Date | null }> {
	return {
		passcodeHash: input.passcode
			? await hashSharePasscode(input.passcode)
			: null,
		expiresAt: input.expiresInDays
			? new Date(Date.now() + input.expiresInDays * DAY_MS)
			: null,
	};
}
