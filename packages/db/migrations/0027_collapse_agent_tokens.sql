-- Enforce the agent⟷token 1:1 model on existing data. The removed multi-token
-- API could leave an agent with several token rows; keep only the oldest per
-- agent and delete the rest, so no legacy extra credential stays live yet hidden
-- from the 1:1 Settings UI. A no-op on databases that never used that API.
DELETE FROM `agent_tokens`
WHERE `id` NOT IN (
	SELECT `id` FROM (
		SELECT
			`id`,
			ROW_NUMBER() OVER (
				PARTITION BY `agent_id`
				ORDER BY `created_at` ASC, `id` ASC
			) AS `rn`
		FROM `agent_tokens`
	)
	WHERE `rn` = 1
);
