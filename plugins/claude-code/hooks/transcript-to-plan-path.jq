# Extracts the session's plan-file path from a Claude Code transcript (JSONL,
# read via `inputs`): plan-mode attachment records (plan_mode, plan_mode_exit,
# plan_mode_reentry) carry it as a structured field — no conversation content
# is parsed. The last reference wins; empty when the session never used plan
# mode.
[ inputs | .attachment.planFilePath // empty ] | last // empty
