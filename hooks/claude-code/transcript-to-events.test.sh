#!/usr/bin/env bash
#
# Tests transcript-to-events.jq against a committed fixture. Run manually or in
# CI where jq is available (the server integration tests are the authoritative
# correctness net; this guards the client-side mapping). Exits non-zero on
# failure, 0 on success, and skips (0) when jq is absent.
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v jq >/dev/null 2>&1; then
	echo "SKIP: jq not found"
	exit 0
fi

fixture="$here/__fixtures__/sample-transcript.jsonl"
events="$(jq -n -f "$here/transcript-to-events.jq" "$fixture")"

fail=0
check() {
	local desc="$1" expr="$2"
	if [ "$(jq -r "$expr" <<<"$events")" = "true" ]; then
		echo "ok   - $desc"
	else
		echo "FAIL - $desc"
		fail=1
	fi
}

# Two real assistant turns (msg_A deduped from 2 lines; msg_B); sidechain dropped.
check "exactly 2 events" 'length == 2'
check "msg_SIDE (isSidechain) excluded" 'all(.[]; .sourceId != "msg_SIDE")'
check "msg_A present" 'any(.[]; .sourceId == "msg_A")'
# Dedup: usage kept once, not summed (output_tokens 323, not 646).
check "msg_A output_tokens == 323 (deduped)" \
	'(.[] | select(.sourceId == "msg_A") | .usage.output_tokens) == 323'
check "msg_A keeps cache_creation_input_tokens" \
	'(.[] | select(.sourceId == "msg_A") | .usage.cache_creation_input_tokens) == 777'
# Earliest line wins for the timestamp.
check "msg_A earliest timestamp" \
	'(.[] | select(.sourceId == "msg_A") | .timestamp) == "2026-06-21T11:16:15.122Z"'
check "msg_A model carried" \
	'(.[] | select(.sourceId == "msg_A") | .model) == "claude-opus-4-8"'

if [ "$fail" -ne 0 ]; then
	echo "transcript-to-events.jq: FAILED"
	exit 1
fi
echo "transcript-to-events.jq: PASSED"
