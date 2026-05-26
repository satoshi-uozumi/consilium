---
name: cs:work
description: "Execute tasks from a feature plan. Use after /cs:consult (and optionally /cs:review) to implement the plan."
effort: high
argument-hint: <feature-name>
user-invocable: true
---

Run the Consilium `/cs:work` workflow.

1. Read `.consilium/plans/<feature-name>/plan.md`. If it doesn't exist, stop and tell the user to run `/cs:consult` first.
2. Execute each unchecked task from the task list one by one.
3. After each change, verify it works before moving to the next task.
4. Mark tasks as complete in `.consilium/plans/<feature-name>/plan.md` as you go.
5. When all tasks are done, tell the user to run `/cs:done` for archival.