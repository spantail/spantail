# Maps a Claude Code transcript (JSONL, read via `inputs`) to Toxil's compact
# agent-events array: one object per assistant message.id, telemetry only.
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
# Pinned to the few fields we consume (type, message.id/usage/model, timestamp);
# everything else is ignored, so unrelated format changes are inert.
[ inputs ]
| map(select(
    .type == "assistant"
    and (.message.id != null)
    and (.message.usage != null)
  ))
| group_by(.message.id)
| map({
    sourceId: .[0].message.id,
    # Earliest line wins; ISO-8601 UTC strings sort lexicographically.
    timestamp: (min_by(.timestamp) | .timestamp),
    model: ([ .[].message.model ] | map(select(. != null)) | first),
    usage: .[0].message.usage,
  })
# Drop a null model rather than send it (the API rejects an explicit null).
| map(if .model == null then del(.model) else . end)
