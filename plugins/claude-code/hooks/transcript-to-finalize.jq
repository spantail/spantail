# Maps a Claude Code transcript (JSONL, read via `inputs`) to the body of
# POST /api/v1/agent-events/finalize: closing facts only, telemetry posture
# unchanged. Takes $session (the session id), $send_summary ("true" to include
# a description), and $plan_title (the session's plan-file title, possibly
# empty — extracted by the SessionEnd hook via transcript-to-plan-path.jq).
#
# - endedAt: the max timestamp across ALL records (not just assistant turns),
#   so trailing tool results and local commands count as session time. The
#   server clamps it, so it can never move an entry backwards.
# - description: only when opted in, and only the plan-file title — a normal
#   session's transcript carries no usable summary (type "summary" records
#   exist only on compacted/resumed sessions), so sessions without a plan
#   simply leave the description null. Capped at 200 chars.
# - context.refs: "pr-link" sidecar records name the PRs the session touched.
#   They are re-emitted repeatedly, so dedup by repository+number; the API
#   accepts at most 20 refs of 200 chars each.

def refs:
	[ .[] | select(.type == "pr-link" and .prRepository != null and .prNumber != null) ]
	| map("github:\(.prRepository)#\(.prNumber)" | .[0:200])
	| unique
	| .[0:20];

[ inputs ] as $records
| ([ $records[] | .timestamp | select(. != null) ] | max) as $ended_at
| ($records | refs) as $refs
| {sessionId: $session}
| (if $ended_at then . + {endedAt: $ended_at} else . end)
| (if $send_summary == "true" and $plan_title != ""
   then . + {description: ($plan_title | .[0:200])}
   else . end)
| (if ($refs | length) > 0 then . + {context: {refs: $refs}} else . end)
