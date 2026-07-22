#!/usr/bin/env bash
#
# Claude Code "Stop" hook → Spantail agent-events ingest.
#
# Modes:
#   (no args)        The Stop hook entry. Persists the stdin payload to a temp
#                    file and detaches a worker, then exits immediately — the
#                    user's turn is never blocked on config resolution, jq, or
#                    the network. A worker that dies mid-flight (host teardown)
#                    loses nothing durable: the next Stop or the SessionEnd
#                    reconcile re-posts the full transcript idempotently.
#   --sync           Synchronous ingest of the stdin payload. Used by the
#                    SessionEnd hook, whose finalize step must run after this
#                    reconcile has created the entry.
#   --ingest <file>  Internal: the detached worker. Reads the payload file and
#                    removes it on exit.
#
# The ingest extracts per-assistant-message token usage and non-usage
# attributes from the transcript with jq (conversation bodies never leave this
# machine), and POSTs the compact events to Spantail. Idempotent on
# (agent, message.id), so it is safe to run on every Stop.
# Never fails the turn: any problem logs to stderr and exits 0.
#
# Requirements: bash, jq, curl.
# Configuration, each resolved as the SPANTAIL_* env var first, then the
# plugin's user config (see lib/config.sh):
#   SPANTAIL_API_URL        / apiUrl        Base URL, e.g. https://spantail.example.com
#   SPANTAIL_AGENT_TOKEN    / agentToken    Agent access token (write-only ingest credential)
#   SPANTAIL_WORKSPACE_ID   / workspaceId   Required by the server; resolved from the repo link
#   SPANTAIL_PROJECT_ID     / projectId     Optional; records the work against a project
set -u

skip() {
	printf 'spantail-agent-stop: %s\n' "$1" >&2
	exit 0
}

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mode="async"
payload_file=""
case "${1:-}" in
--sync) mode="sync" ;;
--ingest)
	mode="worker"
	payload_file="${2:-}"
	;;
esac

if [ "$mode" = "async" ]; then
	# Do the bare minimum before returning the turn: persist stdin, detach a
	# worker, exit. Even config resolution waits for the worker (it costs
	# several jq runs) — misconfiguration is still surfaced synchronously by
	# the SessionEnd hook and by /spantail:doctor. The payload travels via a
	# file, not argv (argv would hit the OS size limit on long sessions), and
	# the worker inherits the environment, so it resolves the same config.
	tmp="$(mktemp "${TMPDIR:-/tmp}/spantail-stop-payload.XXXXXX")" ||
		skip "mktemp failed; skipping"
	if ! cat >"$tmp"; then
		rm -f "$tmp"
		skip "failed to persist hook payload; skipping"
	fi
	# Full fd redirection is what actually frees the turn: a child holding the
	# hook's stdout/stderr pipes would keep the host waiting for EOF. setsid
	# detaches into a new session where available (Linux); macOS has no setsid,
	# so a backgrounded subshell double-forks the worker into an orphan, with
	# nohup shielding it from SIGHUP either way.
	if command -v setsid >/dev/null 2>&1; then
		setsid nohup "$here/spantail-agent-stop.sh" --ingest "$tmp" \
			</dev/null >/dev/null 2>&1 &
	else
		(nohup "$here/spantail-agent-stop.sh" --ingest "$tmp" \
			</dev/null >/dev/null 2>&1 &)
	fi
	exit 0
fi

if [ "$mode" = "worker" ]; then
	[ -n "$payload_file" ] && [ -f "$payload_file" ] ||
		skip "payload file missing; skipping"
	# The payload is single-use state; arm its removal before anything can
	# skip (a missing jq below must not strand payload files turn after turn).
	# A function, not interpolated trap source: the path must never be
	# reparsed as shell (a TMPDIR containing a quote would break the trap).
	cleanup_payload() { rm -f "$payload_file"; }
	trap cleanup_payload EXIT
	hook_payload="$(cat "$payload_file")"
	# Sweep leftovers of workers that were killed before their own trap ran —
	# swept here, off the Stop path, because enumerating a crowded TMPDIR
	# is unbounded work that must never delay the turn.
	find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'spantail-stop-payload.*' \
		-mmin +1440 -delete 2>/dev/null || true
else
	hook_payload="$(cat)"
fi

command -v jq >/dev/null 2>&1 || skip "jq not found; skipping"
command -v curl >/dev/null 2>&1 || skip "curl not found; skipping"

# shellcheck source=lib/config.sh
. "$here/lib/config.sh"
spantail_load_user_config
SPANTAIL_API_URL="$(spantail_config SPANTAIL_API_URL apiUrl)"
SPANTAIL_AGENT_TOKEN="$(spantail_config SPANTAIL_AGENT_TOKEN agentToken)"
SPANTAIL_WORKSPACE_ID="$(spantail_config SPANTAIL_WORKSPACE_ID workspaceId)"
SPANTAIL_PROJECT_ID="$(spantail_config SPANTAIL_PROJECT_ID projectId)"
[ -n "$SPANTAIL_API_URL" ] || skip "SPANTAIL_API_URL not configured; skipping"
[ -n "$SPANTAIL_AGENT_TOKEN" ] || skip "SPANTAIL_AGENT_TOKEN not configured; skipping"

transcript="$(jq -r '.transcript_path // empty' <<<"$hook_payload")"
session="$(jq -r '.session_id // empty' <<<"$hook_payload")"
cwd="$(jq -r '.cwd // empty' <<<"$hook_payload")"
[ -n "$transcript" ] || skip "no transcript_path in hook payload; skipping"
[ -f "$transcript" ] || skip "transcript not found: $transcript; skipping"
[ -n "$session" ] || skip "no session_id in hook payload; skipping"

# The repository URL is the one attribute the transcript doesn't carry; read
# it once from the local git config (no network). Missing git, a non-repo
# cwd, or no origin remote all degrade to omitting the attribute.
repo_url=""
if command -v git >/dev/null 2>&1 && [ -n "$cwd" ] && [ -d "$cwd" ]; then
	repo_url="$(git -C "$cwd" remote get-url origin 2>/dev/null || true)"
fi

events="$(jq -n --arg repo_url "$repo_url" -f "$here/transcript-to-events.jq" "$transcript")" ||
	skip "failed to parse transcript; skipping"

count="$(jq 'length' <<<"$events")"
[ "${count:-0}" -gt 0 ] || exit 0 # early Stop before any assistant turn

# Build the request body, attaching workspace/project only when provided. The
# (potentially large) events array is fed to jq via stdin and the body to curl
# via stdin — never as a command-line argument, which would hit the OS argv size
# limit on long sessions and silently drop telemetry. Only small scalars go in
# argv.
jq_args=(--arg s "$session")
filter='{sessionId: $s, events: .}'
if [ -n "$SPANTAIL_WORKSPACE_ID" ]; then
	jq_args+=(--arg w "$SPANTAIL_WORKSPACE_ID")
	filter+=' + {workspaceId: $w}'
fi
if [ -n "$SPANTAIL_PROJECT_ID" ]; then
	jq_args+=(--arg p "$SPANTAIL_PROJECT_ID")
	filter+=' + {projectId: $p}'
fi

# Bounded timeouts so a slow or down network never blocks the SessionEnd path:
# this is best-effort telemetry and the hook exits 0 on any failure.
jq "${jq_args[@]}" "$filter" <<<"$events" |
	curl -fsS --connect-timeout 2 --max-time 10 -X POST \
		"$SPANTAIL_API_URL/api/v1/agent-events" \
		-H "authorization: Bearer $SPANTAIL_AGENT_TOKEN" \
		-H 'content-type: application/json' \
		--data-binary @- >/dev/null 2>&1 ||
	skip "ingest request failed; skipping"

printf 'spantail-agent-stop: ingested %s event(s) for session %s\n' "$count" "$session" >&2
