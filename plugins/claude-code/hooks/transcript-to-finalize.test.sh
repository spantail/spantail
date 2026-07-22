#!/usr/bin/env bash
#
# Tests transcript-to-finalize.jq and transcript-to-plan-path.jq against the
# committed fixture plus synthetic edge cases. Exits non-zero on failure, 0 on
# success, skips (0) without jq.
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v jq >/dev/null 2>&1; then
	echo "SKIP: jq not found"
	exit 0
fi

fixture="$here/__fixtures__/sample-transcript.jsonl"

fail=0
check() {
	local desc="$1" body="$2" expr="$3"
	if [ "$(jq -r "$expr" <<<"$body")" = "true" ]; then
		echo "ok   - $desc"
	else
		echo "FAIL - $desc"
		fail=1
	fi
}

# --- plan-path extraction (structured attachment records, last wins) ---
plan_path="$(jq -rn -f "$here/transcript-to-plan-path.jq" "$fixture")"
if [ "$plan_path" = "/home/ana/.claude/plans/auth-refactor.md" ]; then
	echo "ok   - plan path extracted from the last plan-mode attachment"
else
	echo "FAIL - plan path extracted from the last plan-mode attachment"
	fail=1
fi
no_plan="$(printf '{"type":"user","timestamp":"2026-06-21T09:00:00.000Z"}\n' |
	jq -rn -f "$here/transcript-to-plan-path.jq")"
if [ -z "$no_plan" ]; then
	echo "ok   - no plan-mode attachment yields empty"
else
	echo "FAIL - no plan-mode attachment yields empty"
	fail=1
fi

# --- finalize body ---
on="$(jq -n --arg session sess-1 --arg send_summary true \
	--arg plan_title "Refactor the auth middleware" \
	-f "$here/transcript-to-finalize.jq" "$fixture")"
off="$(jq -n --arg session sess-1 --arg send_summary false \
	--arg plan_title "Refactor the auth middleware" \
	-f "$here/transcript-to-finalize.jq" "$fixture")"
no_title="$(jq -n --arg session sess-1 --arg send_summary true --arg plan_title "" \
	-f "$here/transcript-to-finalize.jq" "$fixture")"

check "sessionId set" "$on" '.sessionId == "sess-1"'
# The max timestamp lives on a trailing system line, not an assistant turn.
check "endedAt is the max timestamp of any record" "$on" \
	'.endedAt == "2026-06-21T11:20:00.000Z"'
# Opt-in on: the plan title becomes the description.
check "description is the plan title" "$on" \
	'.description == "Refactor the auth middleware"'
# Opt-in off: no conversation-derived content leaves the machine.
check "description omitted when opted out" "$off" \
	'has("description") == false'
# Opted in but the session has no plan: description stays absent (nullable).
check "description omitted without a plan title" "$no_title" \
	'has("description") == false'
# pr-link records: re-emitted #128 collapses to one ref; #129 kept.
check "refs deduped by repo+number" "$on" \
	'.context.refs == ["github:acme/site#128", "github:acme/site#129"]'
check "refs identical regardless of opt-in" "$off" \
	'.context.refs == ["github:acme/site#128", "github:acme/site#129"]'

# Synthetic: no pr-links → context omitted, and a records-only timestamp
# still yields endedAt.
minimal='{"type":"user","timestamp":"2026-06-21T09:00:00.000Z"}
{"type":"user","timestamp":"2026-06-21T09:05:00.000Z"}'
min_body="$(printf '%s\n' "$minimal" |
	jq -n --arg session s2 --arg send_summary true --arg plan_title "" \
		-f "$here/transcript-to-finalize.jq")"
check "no pr-links omits context" "$min_body" 'has("context") == false'
check "endedAt from the latest record" "$min_body" \
	'.endedAt == "2026-06-21T09:05:00.000Z"'

# --- session-title fallback (type:"summary" records) ---
# Opted in, no plan: the last summary record's text becomes the description.
with_summary='{"type":"summary","summary":"Old title","leafUuid":"a"}
{"type":"summary","summary":"Fix the auth flow","leafUuid":"b"}
{"type":"user","timestamp":"2026-06-21T09:00:00.000Z"}'
sum_body="$(printf '%s\n' "$with_summary" |
	jq -n --arg session s5 --arg send_summary true --arg plan_title "" \
		-f "$here/transcript-to-finalize.jq")"
check "summary title used when no plan title" "$sum_body" \
	'.description == "Fix the auth flow"'
# A plan title outranks the summary title.
sum_plan_body="$(printf '%s\n' "$with_summary" |
	jq -n --arg session s5 --arg send_summary true \
		--arg plan_title "Refactor the auth middleware" \
		-f "$here/transcript-to-finalize.jq")"
check "plan title outranks the summary title" "$sum_plan_body" \
	'.description == "Refactor the auth middleware"'
# Opt-out: the summary title must not leave the machine either.
sum_off_body="$(printf '%s\n' "$with_summary" |
	jq -n --arg session s5 --arg send_summary false --arg plan_title "" \
		-f "$here/transcript-to-finalize.jq")"
check "summary title withheld when opted out" "$sum_off_body" \
	'has("description") == false'
# Degenerate summary records (empty or non-string) yield no description.
bad_summary='{"type":"summary","summary":""}
{"type":"summary","summary":42}
{"type":"summary"}'
bad_sum_body="$(printf '%s\n' "$bad_summary" |
	jq -n --arg session s6 --arg send_summary true --arg plan_title "" \
		-f "$here/transcript-to-finalize.jq")"
check "degenerate summary records omit description" "$bad_sum_body" \
	'has("description") == false'
# An over-long summary title is capped like the plan title.
long_sum_body="$(printf '{"type":"summary","summary":"%s"}\n' \
	"$(printf 'y%.0s' $(seq 1 260))" |
	jq -n --arg session s7 --arg send_summary true --arg plan_title "" \
		-f "$here/transcript-to-finalize.jq")"
check "summary title capped at 200 chars" "$long_sum_body" \
	'(.description | length) == 200'

# Synthetic: an empty-string timestamp is ignored, not emitted as endedAt.
blank_ts="$(printf '{"type":"user","timestamp":""}\n' |
	jq -n --arg session s4 --arg send_summary false --arg plan_title "" \
		-f "$here/transcript-to-finalize.jq")"
check "empty-string timestamps omit endedAt" "$blank_ts" \
	'has("endedAt") == false'

# Synthetic: an over-long plan title is capped at the deliberate 200-char
# title budget (tighter than the API's 2000-char description limit), and an
# empty transcript omits endedAt.
long_body="$(printf '' |
	jq -n --arg session s3 --arg send_summary true \
		--arg plan_title "$(printf 'x%.0s' $(seq 1 260))" \
		-f "$here/transcript-to-finalize.jq")"
check "description capped at 200 chars" "$long_body" \
	'(.description | length) == 200'
check "no timestamps omits endedAt" "$long_body" 'has("endedAt") == false'

if [ "$fail" -ne 0 ]; then
	echo "transcript-to-finalize.jq: FAILED"
	exit 1
fi
echo "transcript-to-finalize.jq: PASSED"
