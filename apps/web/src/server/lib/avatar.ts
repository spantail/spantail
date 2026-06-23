/**
 * Avatar storage helpers. Uploaded avatars live in the UPLOADS R2 bucket under
 * `avatars/<userId>` (one object per user, overwritten on each upload). The
 * user's `image` column holds a short cache-busting token for our own uploads,
 * or an absolute URL when an OAuth provider supplied the picture.
 */

/** Image content types accepted for avatar uploads. */
export const ALLOWED_AVATAR_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
]);

/** Hard server-side ceiling; the client resizes to 256px webp well under this. */
export const MAX_AVATAR_BYTES = 1024 * 1024;

/** The R2 object key for a user's avatar. */
export function avatarObjectKey(userId: string): string {
	return `avatars/${userId}`;
}

/** A fresh cache-busting token stored in `user.image` on each upload. */
export function newAvatarToken(): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Resolves a user's stored `image` into a ready-to-use avatar URL, or null when
 * the user has no avatar. An absolute URL (OAuth provider picture) is returned
 * as-is; otherwise the value is our cache-busting token and the avatar is served
 * from the Worker.
 */
export function resolveAvatarUrl(
	userId: string,
	image: string | null | undefined,
): string | null {
	if (!image) return null;
	if (/^https?:\/\//.test(image)) return image;
	return `/api/v1/avatars/${userId}?v=${image}`;
}
