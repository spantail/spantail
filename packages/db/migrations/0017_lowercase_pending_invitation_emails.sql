-- The previous exact-match lookup allowed two pending invitations that differ
-- only by email case. Lower-casing both (below) would collide them, and the
-- social-onboarding lookup uses `.get()`, so it could grant the wrong
-- `grantAdmin` and leave a duplicate pending. Collapse each case-insensitive
-- group of still-open invitations first, keeping the strongest (admin-granting,
-- then newest) so the lower-cased email is unique.
DELETE FROM `user_invitations`
WHERE `accepted_at` IS NULL
	AND `id` NOT IN (
		SELECT `id` FROM `user_invitations` AS `dup`
		WHERE `dup`.`accepted_at` IS NULL
			AND lower(`dup`.`email`) = lower(`user_invitations`.`email`)
		ORDER BY `dup`.`grant_admin` DESC, `dup`.`created_at` DESC
		LIMIT 1
	);
--> statement-breakpoint
-- Backfill: lower-case the email of every still-open invitation. New
-- invitations are normalized at the API boundary, but a pre-existing pending
-- invite typed with uppercase (e.g. `Jane@Example.com`) would never match the
-- lower-cased email a Google/GitHub sign-in resolves, so social acceptance
-- would silently fail. Accepted invitations are historical and left untouched.
UPDATE `user_invitations`
SET `email` = lower(`email`)
WHERE `accepted_at` IS NULL;
