# Maps a Claude Code transcript (JSONL, read via `inputs`) to Spantail's compact
# agent-events array: one object per assistant message.id, telemetry only.
# Takes $repo_url (the cwd's `git remote get-url origin`, possibly empty).
#
# Why dedup by message.id: a single assistant message is written across several
# transcript lines (thinking, tool_use, ...) that all repeat the SAME message.id
# and the SAME usage block. Summing the lines overcounts tokens ~2.7x, so we
# collapse to one event per message.id and keep its usage once.
#
# Subagent (Task) turns are INCLUDED: they are separate API calls with their own
# message.id and message.usage (the parent's usage does not cover them), so
# dropping them would undercount real spend. Dedup by message.id already counts
# each call once, so including sidechains never double-counts. Only non-assistant
# lines (user/system/meta) are skipped.
#
# Pinned to the few fields we consume (type, message.id/usage/model, timestamp,
# gitBranch, cwd, version, requestId); everything else is ignored, so unrelated
# format changes are inert.

# Normalize a git remote URL for the vcs.repository.url.full attribute:
# scp-like ssh forms (git@host:org/repo.git) become https, URL userinfo is
# stripped (an https remote can embed credentials — user:token@host — which
# must never reach telemetry), a trailing .git is dropped, and the value is
# capped at the API's 500-char attribute limit.
def normalize_repo_url:
	sub("^git@(?<host>[^:/]+):"; "https://\(.host)/")
	| sub("^ssh://(?<u>[^/@]*@)?"; "https://")
	| sub("^(?<scheme>https?://)[^/@]*@"; "\(.scheme)")
	| sub("\\.git$"; "")
	| .[0:500];

# First non-null value of a field across the message's transcript lines.
def first_of(f): [ .[] | f ] | map(select(. != null)) | first;

[ inputs ]
| map(select(
    .type == "assistant"
    and (.message.id != null)
    and (.message.usage != null)
  ))
| group_by(.message.id)
| map(
    {
      sourceId: .[0].message.id,
      # Earliest line wins; ISO-8601 UTC strings sort lexicographically.
      timestamp: (min_by(.timestamp) | .timestamp),
      model: first_of(.message.model),
      usage: .[0].message.usage,
      attributes: ({
        "vcs.ref.head.name": first_of(.gitBranch),
        "vcs.repository.url.full":
          (if $repo_url == "" then null else ($repo_url | normalize_repo_url) end),
        "process.working_directory": first_of(.cwd),
        "app.version": first_of(.version),
        "request.id": first_of(.requestId),
      } | with_entries(select(.value != null and .value != ""))),
    }
  )
# Drop a null model rather than send it, and an empty attributes object rather
# than an empty one-size map (the API rejects an explicit null; empty is noise).
| map(if .model == null then del(.model) else . end)
| map(if .attributes == {} then del(.attributes) else . end)
