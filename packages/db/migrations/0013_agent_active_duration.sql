ALTER TABLE `agent_entries` ADD `active_duration_minutes` integer;--> statement-breakpoint
-- Backfill from stored event timestamps: sum consecutive gaps at or under the
-- idle cutoff (900000 ms = AGENT_ACTIVE_IDLE_GAP_MS, 15 min) per session.
-- Summary-path rows have no events, match nothing, and stay null. The finalize
-- tail (last event -> finalized end) is not recoverable per row and is left
-- out (undercounts by at most 15 min).
UPDATE agent_entries
SET active_duration_minutes = a.active_min
FROM (
  SELECT agent_id, session_id,
         cast(round(coalesce(sum(CASE WHEN gap <= 900000 THEN gap END), 0) / 60000.0) as integer) AS active_min
  FROM (
    SELECT agent_id, session_id,
           timestamp - lag(timestamp) OVER (
             PARTITION BY agent_id, session_id ORDER BY timestamp, id
           ) AS gap
    FROM agent_events
  )
  GROUP BY agent_id, session_id
) AS a
WHERE agent_entries.agent_id = a.agent_id AND agent_entries.session_id = a.session_id;
