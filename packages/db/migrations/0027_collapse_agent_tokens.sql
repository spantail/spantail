-- Enforce the agent⟷token 1:1 model on existing data. The removed multi-token
-- API could leave an agent with several token rows; keep one per agent and
-- delete the rest, so no legacy extra credential stays live yet hidden from the
-- 1:1 Settings UI. A no-op on databases that never used that API.
--
-- The survivor is the most usable token, not the oldest: prefer a non-expired
-- row over an expired one (resolveAat rejects expired tokens), then the most
-- recently used, then the newest — so collapsing never drops an agent's only
-- working credential in favor of a stale one.
DELETE FROM `agent_tokens`
WHERE `id` NOT IN (
	SELECT `id` FROM (
		SELECT
			`id`,
			ROW_NUMBER() OVER (
				PARTITION BY `agent_id`
				ORDER BY
					CASE
						WHEN `expires_at` IS NULL
							OR `expires_at` > (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
						THEN 0 ELSE 1
					END ASC,
					`last_used_at` DESC,
					`created_at` DESC,
					`id` DESC
			) AS `rn`
		FROM `agent_tokens`
	)
	WHERE `rn` = 1
);
