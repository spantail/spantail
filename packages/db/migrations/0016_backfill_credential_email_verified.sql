-- Backfill: mark existing email/password users as email-verified so they can
-- link a Google account on first social sign-in. Better Auth refuses to link a
-- social login into a local account whose email is unverified
-- (requireLocalEmailVerified defaults to true); these accounts predate the
-- verify-on-provision change and would otherwise be permanently unlinkable.
-- Scoped to credential (password) accounts only: OAuth-provisioned users
-- already carry the provider's verification state, and GitHub stays unverified
-- by design.
UPDATE `user`
SET `email_verified` = 1
WHERE `id` IN (
	SELECT `user_id` FROM `account` WHERE `provider_id` = 'credential'
);
