-- Backfill: lower-case the email of every still-open invitation. New
-- invitations are normalized at the API boundary, but a pre-existing pending
-- invite typed with uppercase (e.g. `Jane@Example.com`) would never match the
-- lower-cased email a Google/GitHub sign-in resolves, so social acceptance
-- would silently fail. Accepted invitations are historical and left untouched.
UPDATE `user_invitations`
SET `email` = lower(`email`)
WHERE `accepted_at` IS NULL;
