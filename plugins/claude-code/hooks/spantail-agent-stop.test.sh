#!/usr/bin/env bash
#
# Tests spantail-agent-stop.sh's three modes (--sync, --ingest worker, and the
# detaching async default) against the committed fixture, with curl stubbed via
# PATH so nothing leaves the machine. Exits non-zero on failure, 0 on success,
# skips (0) without jq.
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v jq >/dev/null 2>&1; then
	echo "SKIP: jq not found"
	exit 0
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# Stub curl: record the stdin body, succeed. The hooks call curl with the body
# on stdin, so this captures exactly what would have been sent.
cat >"$workdir/curl" <<'EOF'
#!/usr/bin/env bash
cat >"${SPANTAIL_TEST_CURL_BODY:?}"
EOF
chmod +x "$workdir/curl"

export PATH="$workdir:$PATH"
export SPANTAIL_TEST_CURL_BODY="$workdir/curl-body"
export SPANTAIL_API_URL="https://spantail.test"
export SPANTAIL_AGENT_TOKEN="spantail_aat_test"
export SPANTAIL_WORKSPACE_ID="ws-test"
# Contain the async payload files, and keep repo/user config out of the test.
export TMPDIR="$workdir"
export CLAUDE_PROJECT_DIR=""
export CLAUDE_CONFIG_DIR="$workdir/no-such-config"
unset SPANTAIL_PROJECT_ID 2>/dev/null || true

payload() {
	jq -n --arg t "$here/__fixtures__/sample-transcript.jsonl" \
		'{transcript_path: $t, session_id: "sess-test", cwd: "/nonexistent"}'
}

fail=0
pass() { echo "ok   - $1"; }
flunk() {
	echo "FAIL - $1"
	fail=1
}

body_ok() {
	jq -e '.sessionId == "sess-test" and (.events | length) > 0
		and .workspaceId == "ws-test"' "$SPANTAIL_TEST_CURL_BODY" >/dev/null 2>&1
}

# --- --sync: inline ingest, exit 0 ---
rm -f "$SPANTAIL_TEST_CURL_BODY"
if payload | "$here/spantail-agent-stop.sh" --sync 2>/dev/null; then
	pass "--sync exits 0"
else
	flunk "--sync exits 0"
fi
if body_ok; then
	pass "--sync posts sessionId, events, and workspaceId"
else
	flunk "--sync posts sessionId, events, and workspaceId"
fi

# --- --ingest: worker reads the payload file and removes it ---
rm -f "$SPANTAIL_TEST_CURL_BODY"
pf="$workdir/spantail-stop-payload.test"
payload >"$pf"
"$here/spantail-agent-stop.sh" --ingest "$pf" 2>/dev/null
if body_ok; then
	pass "--ingest posts the payload file's ingest body"
else
	flunk "--ingest posts the payload file's ingest body"
fi
if [ ! -f "$pf" ]; then
	pass "--ingest removes the payload file"
else
	flunk "--ingest removes the payload file"
fi

# A worker whose payload file is gone skips cleanly.
if "$here/spantail-agent-stop.sh" --ingest "$workdir/never-existed" 2>/dev/null; then
	pass "--ingest without a payload file exits 0"
else
	flunk "--ingest without a payload file exits 0"
fi

# A worker that skips (here: no config) still removes its payload file — the
# cleanup trap is armed before any skip can fire.
rm -f "$SPANTAIL_TEST_CURL_BODY"
pf2="$workdir/spantail-stop-payload.skip"
payload >"$pf2"
SPANTAIL_API_URL="" SPANTAIL_AGENT_TOKEN="" \
	"$here/spantail-agent-stop.sh" --ingest "$pf2" 2>/dev/null
if [ ! -f "$pf2" ] && [ ! -f "$SPANTAIL_TEST_CURL_BODY" ]; then
	pass "a skipping worker still removes its payload file"
else
	flunk "a skipping worker still removes its payload file"
fi

# --- async (no args): returns immediately, ingest happens detached ---
rm -f "$SPANTAIL_TEST_CURL_BODY"
start="$(date +%s)"
payload | "$here/spantail-agent-stop.sh" 2>/dev/null
elapsed="$(($(date +%s) - start))"
if [ "$elapsed" -le 1 ]; then
	pass "async returns within a second"
else
	flunk "async returns within a second (took ${elapsed}s)"
fi
for _ in $(seq 1 100); do
	[ -f "$SPANTAIL_TEST_CURL_BODY" ] && break
	sleep 0.1
done
if body_ok; then
	pass "detached worker posted the ingest body"
else
	flunk "detached worker posted the ingest body"
fi
# The worker's EXIT trap removed its payload file.
sleep 0.2
leftovers="$(find "$workdir" -maxdepth 1 -name 'spantail-stop-payload.XXXXXX*' 2>/dev/null)"
if [ -z "$(find "$workdir" -maxdepth 1 -name 'spantail-stop-payload.??????' 2>/dev/null)" ]; then
	pass "async payload file cleaned up"
else
	flunk "async payload file cleaned up ($leftovers)"
fi

# --- misconfiguration still skips synchronously in sync mode ---
rm -f "$SPANTAIL_TEST_CURL_BODY"
if payload | SPANTAIL_API_URL="" SPANTAIL_AGENT_TOKEN="" \
	"$here/spantail-agent-stop.sh" --sync 2>/dev/null; then
	pass "--sync without config exits 0"
else
	flunk "--sync without config exits 0"
fi
if [ ! -f "$SPANTAIL_TEST_CURL_BODY" ]; then
	pass "--sync without config sends nothing"
else
	flunk "--sync without config sends nothing"
fi

if [ "$fail" -ne 0 ]; then
	echo "spantail-agent-stop.sh: FAILED"
	exit 1
fi
echo "spantail-agent-stop.sh: PASSED"
