ALTER TABLE `agent_entries` ADD `active_duration_minutes` integer;--> statement-breakpoint
-- Backfill from stored event timestamps: sum consecutive gaps at or under the
-- idle cutoff (900000 ms = AGENT_ACTIVE_IDLE_GAP_MS, 15 min), plus the
-- finalize tail — ended_at retains a finalized wall-clock end while
-- max(timestamp) is the last event, so their positive difference counts when
-- within the cutoff — rounded once, matching the runtime derivation. Rows
-- without events (summary path) match nothing and stay null.
UPDATE agent_entries
SET active_duration_minutes = cast(round((
  a.active_ms
  + (CASE
      WHEN agent_entries.ended_at - a.last_ts BETWEEN 1 AND 900000
      THEN agent_entries.ended_at - a.last_ts
      ELSE 0
    END)
) / 60000.0) as integer)
FROM (
  SELECT agent_id, session_id,
         coalesce(sum(CASE WHEN gap <= 900000 THEN gap END), 0) AS active_ms,
         max(ts) AS last_ts
  FROM (
    SELECT agent_id, session_id, timestamp AS ts,
           timestamp - lag(timestamp) OVER (
             PARTITION BY agent_id, session_id ORDER BY timestamp, id
           ) AS gap
    FROM agent_events
  )
  GROUP BY agent_id, session_id
) AS a
WHERE agent_entries.agent_id = a.agent_id AND agent_entries.session_id = a.session_id;
