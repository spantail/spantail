# Maps a Claude Code transcript (JSONL, read via `inputs`) to the body of
# POST /api/v1/agent-events/finalize: closing facts only, telemetry posture
# unchanged. Takes $session (the session id) and $send_summary ("true" to
# include the session's summary title as the description).
#
# - endedAt: the max timestamp across ALL records (not just assistant turns),
#   so trailing tool results and local commands count as session time. The
#   server clamps it, so it can never move an entry backwards.
# - description: Claude Code generates short summary-title records
#   (type "summary"). They are derived from conversation content, so they are
#   only sent when the user opted in; the last one wins and is capped at the
#   API's 2000-char description limit.
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
| ([ $records[] | select(.type == "summary") | .summary
    | select(. != null and . != "") ] | last) as $summary
| ($records | refs) as $refs
| {sessionId: $session}
| (if $ended_at then . + {endedAt: $ended_at} else . end)
| (if $send_summary == "true" and $summary != null
   then . + {description: ($summary | .[0:2000])}
   else . end)
| (if ($refs | length) > 0 then . + {context: {refs: $refs}} else . end)
