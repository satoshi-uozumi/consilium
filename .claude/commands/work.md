Run the Consilium `/work` workflow.

1. Read `plan.md`. If it doesn't exist, stop and tell the user to run `/consult` first.
2. Execute each unchecked task from the task list one by one.
3. After each change, verify it works before moving to the next task.
4. Mark tasks as complete in `plan.md` as you go.
5. When all tasks are done, tell the user to run `/done` for post-generate review and archival.
