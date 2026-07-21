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
events="$(jq -n --arg repo_url "git@github.com:acme/site.git" \
	-f "$here/transcript-to-events.jq" "$fixture")"

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

# Three assistant turns: msg_A (deduped from 2 lines), msg_B, and the subagent
# turn msg_SIDE (isSidechain) — subagent calls are real, separately-billed spend.
check "exactly 3 events" 'length == 3'
check "subagent turn (msg_SIDE) included" 'any(.[]; .sourceId == "msg_SIDE")'
check "msg_A present" 'any(.[]; .sourceId == "msg_A")'
# Dedup: usage kept once, not summed (output_tokens 323, not 646).
check "msg_A output_tokens == 323 (deduped)" \
	'(.[] | select(.sourceId == "msg_A") | .usage.output_tokens) == 323'
check "msg_A keeps cache_creation_input_tokens" \
	'(.[] | select(.sourceId == "msg_A") | .usage.cache_creation_input_tokens) == 777'
# Usage is pruned to the ingest schema's supported shape: scalars and one-level
# buckets of scalars survive; arrays and deeper nesting (usage.iterations) drop.
check "msg_A keeps the nested cache_creation bucket" \
	'(.[] | select(.sourceId == "msg_A") | .usage.cache_creation.ephemeral_5m_input_tokens) == 777'
check "msg_A iterations array pruned" \
	'(.[] | select(.sourceId == "msg_A") | .usage | has("iterations")) == false'
# Earliest line wins for the timestamp.
check "msg_A earliest timestamp" \
	'(.[] | select(.sourceId == "msg_A") | .timestamp) == "2026-06-21T11:16:15.122Z"'
check "msg_A model carried" \
	'(.[] | select(.sourceId == "msg_A") | .model) == "claude-opus-4-8"'

# Attributes: OTel-keyed, sourced from the transcript lines plus $repo_url.
check "msg_A branch attribute" \
	'(.[] | select(.sourceId == "msg_A") | .attributes["vcs.ref.head.name"]) == "feature/auth-refactor"'
check "msg_A working directory attribute" \
	'(.[] | select(.sourceId == "msg_A") | .attributes["process.working_directory"]) == "/home/ana/site"'
check "msg_A client version attribute" \
	'(.[] | select(.sourceId == "msg_A") | .attributes["app.version"]) == "2.1.201"'
check "msg_A request id attribute" \
	'(.[] | select(.sourceId == "msg_A") | .attributes["request.id"]) == "req_011"'
check "msg_B has its own request id" \
	'(.[] | select(.sourceId == "msg_B") | .attributes["request.id"]) == "req_012"'
# The ssh remote form is normalized to https and stripped of .git.
check "repo url normalized to https" \
	'(.[] | select(.sourceId == "msg_A") | .attributes["vcs.repository.url.full"]) == "https://github.com/acme/site"'
# Sidechain lines carry no branch/cwd/version, but the repo url still applies.
check "msg_SIDE keeps only the repo url attribute" \
	'(.[] | select(.sourceId == "msg_SIDE") | .attributes) == {"vcs.repository.url.full": "https://github.com/acme/site"}'

# Without a repo url the sidechain turn has no attributes at all — the key is
# omitted rather than sent empty.
bare="$(jq -n --arg repo_url "" -f "$here/transcript-to-events.jq" "$fixture")"
check_bare() {
	local desc="$1" expr="$2"
	if [ "$(jq -r "$expr" <<<"$bare")" = "true" ]; then
		echo "ok   - $desc"
	else
		echo "FAIL - $desc"
		fail=1
	fi
}
check_bare "empty repo_url omits the repo attribute" \
	'all(.[]; (.attributes["vcs.repository.url.full"] // "absent") == "absent")'
check_bare "attributes omitted when nothing to send" \
	'(.[] | select(.sourceId == "msg_SIDE") | has("attributes")) == false'

# An already-https remote keeps its host/path (only .git is stripped).
https_form="$(jq -n --arg repo_url "https://github.com/acme/site.git" \
	-f "$here/transcript-to-events.jq" "$fixture")"
if [ "$(jq -r '.[0].attributes["vcs.repository.url.full"]' <<<"$https_form")" = "https://github.com/acme/site" ]; then
	echo "ok   - https remote form normalized"
else
	echo "FAIL - https remote form normalized"
	fail=1
fi

# Credentials embedded in a remote (PAT-backed https clones, ssh userinfo)
# are stripped before the URL becomes telemetry.
cred_form="$(jq -n --arg repo_url "https://x-token:ghp_secret123@github.com/acme/site.git" \
	-f "$here/transcript-to-events.jq" "$fixture")"
if [ "$(jq -r '.[0].attributes["vcs.repository.url.full"]' <<<"$cred_form")" = "https://github.com/acme/site" ]; then
	echo "ok   - https userinfo credentials stripped"
else
	echo "FAIL - https userinfo credentials stripped"
	fail=1
fi
ssh_user_form="$(jq -n --arg repo_url "ssh://ana@github.com/acme/site.git" \
	-f "$here/transcript-to-events.jq" "$fixture")"
if [ "$(jq -r '.[0].attributes["vcs.repository.url.full"]' <<<"$ssh_user_form")" = "https://github.com/acme/site" ]; then
	echo "ok   - ssh userinfo stripped"
else
	echo "FAIL - ssh userinfo stripped"
	fail=1
fi

# A local-path remote is not a repository URL — the attribute is dropped
# rather than leaking a filesystem path.
local_form="$(jq -n --arg repo_url "/home/me/repos/site" \
	-f "$here/transcript-to-events.jq" "$fixture")"
if [ "$(jq -r '.[0].attributes["vcs.repository.url.full"] // "absent"' <<<"$local_form")" = "absent" ]; then
	echo "ok   - local-path remote omitted"
else
	echo "FAIL - local-path remote omitted"
	fail=1
fi

# A line without a timestamp cannot form a valid event (the ingest schema
# requires one) and is dropped instead of 400ing the whole batch.
no_ts="$(jq -nc '{type: "assistant", message: {id: "msg_NOTS", model: "m", usage: {input_tokens: 1}}}' |
	jq -n --arg repo_url "" -f "$here/transcript-to-events.jq")"
if [ "$(jq -r 'length' <<<"$no_ts")" = "0" ]; then
	echo "ok   - missing timestamp drops the line"
else
	echo "FAIL - missing timestamp drops the line"
	fail=1
fi

# Inside a usage bucket only the out-of-shape entries are dropped; scalar
# siblings survive. Top-level arrays drop entirely.
mixed="$(jq -nc '{type: "assistant", timestamp: "2026-06-21T11:00:00.000Z", message: {id: "msg_M", model: "m", usage: {a: {ok: 1, deep: {x: 1}, arr: [2]}, list: [1], n: 7}}}' |
	jq -n --arg repo_url "" -f "$here/transcript-to-events.jq")"
if [ "$(jq -c '.[0].usage' <<<"$mixed")" = '{"a":{"ok":1},"n":7}' ]; then
	echo "ok   - out-of-shape usage values pruned"
else
	echo "FAIL - out-of-shape usage values pruned"
	fail=1
fi

# Every attribute value is capped at the API's 500-char limit — an oversized
# cwd must not 400 the whole batch.
long_cwd="$(printf 'x%.0s' $(seq 1 600))"
capped="$(jq -nc --arg cwd "/$long_cwd" '{type: "assistant", timestamp: "2026-06-21T11:00:00.000Z", cwd: $cwd, message: {id: "msg_L", model: "m", usage: {input_tokens: 1}}}' |
	jq -n --arg repo_url "" -f "$here/transcript-to-events.jq")"
if [ "$(jq -r '.[0].attributes["process.working_directory"] | length' <<<"$capped")" = "500" ]; then
	echo "ok   - long cwd capped at 500 chars"
else
	echo "FAIL - long cwd capped at 500 chars"
	fail=1
fi

if [ "$fail" -ne 0 ]; then
	echo "transcript-to-events.jq: FAILED"
	exit 1
fi
echo "transcript-to-events.jq: PASSED"
