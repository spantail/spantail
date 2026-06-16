/**
 * Generates a random temporary password (~24 chars, base64url). Used when an
 * instance admin creates a user with email delivery off: the password is shown
 * to the admin exactly once and conveyed to the user out of band.
 */
export function generateTempPassword(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}
