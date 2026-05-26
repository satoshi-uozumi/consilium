---
name: cs:done
description: "Archive a completed feature plan. Use when all tasks in the plan are complete."
effort: low
argument-hint: <feature-name>
user-invocable: true
---

Run the Consilium `/cs:done` workflow.

1. Read `.consilium/plans/<feature-name>/plan.md`. If it doesn't exist, stop and tell the user there is nothing to finalize.
2. Verify all tasks in the plan are checked off. If any remain, tell the user and stop.
3. Summarize what was built and any open decisions left for the user.