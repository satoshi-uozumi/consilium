---
name: cs:done
description: "Archive a completed feature plan. Use when all tasks in the plan are complete."
effort: low
argument-hint: <feature-name>
user-invocable: true
---

Run the Consilium `/cs:done` workflow.

1. Read `<feature-name>/plan.md`. If it doesn't exist, stop and tell the user there is nothing to finalize.
2. Archive `<feature-name>/plan.md`:
   - Create `.consilium/plans/` if it doesn't exist
   - Move `<feature-name>/plan.md` to `.consilium/plans/<YYYY-MM-DD>-<feature-name>-plan.md`
3. Summarize what was built and any open decisions left for the user.