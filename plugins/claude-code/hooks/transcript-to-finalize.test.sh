#!/usr/bin/env bash
#
# Tests transcript-to-finalize.jq against the committed fixture plus synthetic
# edge cases. Exits non-zero on failure, 0 on success, skips (0) without jq.
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

on="$(jq -n --arg session sess-1 --arg send_summary true \
	-f "$here/transcript-to-finalize.jq" "$fixture")"
off="$(jq -n --arg session sess-1 --arg send_summary false \
	-f "$here/transcript-to-finalize.jq" "$fixture")"

check "sessionId set" "$on" '.sessionId == "sess-1"'
# The max timestamp lives on a trailing system line, not an assistant turn.
check "endedAt is the max timestamp of any record" "$on" \
	'.endedAt == "2026-06-21T11:20:00.000Z"'
# Opt-in on: the LAST summary record wins.
check "description is the last summary title" "$on" \
	'.description == "Refactor the auth middleware"'
# Opt-in off: no conversation-derived content leaves the machine.
check "description omitted when opted out" "$off" \
	'has("description") == false'
# pr-link records: re-emitted #128 collapses to one ref; #129 kept.
check "refs deduped by repo+number" "$on" \
	'.context.refs == ["github:acme/site#128", "github:acme/site#129"]'
check "refs identical regardless of opt-in" "$off" \
	'.context.refs == ["github:acme/site#128", "github:acme/site#129"]'

# Synthetic: no pr-links and no summary → context and description omitted,
# and a records-only timestamp still yields endedAt.
minimal='{"type":"user","timestamp":"2026-06-21T09:00:00.000Z"}
{"type":"user","timestamp":"2026-06-21T09:05:00.000Z"}'
min_body="$(printf '%s\n' "$minimal" |
	jq -n --arg session s2 --arg send_summary true -f "$here/transcript-to-finalize.jq")"
check "no pr-links omits context" "$min_body" 'has("context") == false'
check "no summary omits description even when opted in" "$min_body" \
	'has("description") == false'
check "endedAt from the latest record" "$min_body" \
	'.endedAt == "2026-06-21T09:05:00.000Z"'

# Synthetic: an over-long summary is capped at the 2000-char API limit.
long_body="$(jq -nc '{type: "summary", summary: ("x" * 2500)}' |
	jq -n --arg session s3 --arg send_summary true -f "$here/transcript-to-finalize.jq")"
check "description capped at 2000 chars" "$long_body" \
	'(.description | length) == 2000'
check "no timestamps omits endedAt" "$long_body" 'has("endedAt") == false'

if [ "$fail" -ne 0 ]; then
	echo "transcript-to-finalize.jq: FAILED"
	exit 1
fi
echo "transcript-to-finalize.jq: PASSED"
