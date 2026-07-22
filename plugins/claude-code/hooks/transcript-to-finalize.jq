# Maps a Claude Code transcript (JSONL, read via `inputs`) to the body of
# POST /api/v1/agent-events/finalize: closing facts only, telemetry posture
# unchanged. Takes $session (the session id), $send_summary ("true" to include
# a description), and $plan_title (the session's plan-file title, possibly
# empty — extracted by the SessionEnd hook via transcript-to-plan-path.jq).
#
# - endedAt: the max timestamp across ALL records (not just assistant turns),
#   so trailing tool results and local commands count as session time. The
#   server clamps it, so it can never move an entry backwards.
# - description: only when opted in. The plan-file title wins (a heading the
#   user explicitly approved); otherwise the last "summary" record's text —
#   the conversation title Claude Code itself generated. Summary records
#   exist only on compacted/resumed sessions and the last one is the newest,
#   so a fresh session without a plan still leaves the description null; a
#   resumed session may inherit its predecessor's title, an accepted limit
#   of purely mechanical extraction. Deliberately capped at 200 chars,
#   well under the API's 2000-char description limit: this is a title line
#   for the timeline, not a body, and both sources can run long.
# - context.refs: "pr-link" sidecar records name the PRs the session touched.
#   They are re-emitted repeatedly, so dedup by repository+number; the API
#   accepts at most 20 refs of 200 chars each.

def refs:
	[ .[] | select(.type == "pr-link" and .prRepository != null and .prNumber != null) ]
	| map("github:\(.prRepository)#\(.prNumber)" | .[0:200])
	| unique
	| .[0:20];

[ inputs ] as $records
| ([ $records[] | .timestamp | select(. != null and . != "") ] | max) as $ended_at
| ($records | refs) as $refs
| {sessionId: $session}
| (if $ended_at then . + {endedAt: $ended_at} else . end)
| (if $send_summary == "true"
   then (if $plan_title != "" then $plan_title
         else ([ $records[] | select(.type == "summary") | .summary
                 | strings | select(. != "") ] | last // "")
         end) as $title
        | (if $title != "" then . + {description: ($title | .[0:200])} else . end)
   else . end)
| (if ($refs | length) > 0 then . + {context: {refs: $refs}} else . end)
