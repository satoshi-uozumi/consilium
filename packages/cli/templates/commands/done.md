Run the Consilium `/done` workflow.

1. Read `plan.md`. If it doesn't exist, stop and tell the user there is nothing to finalize.
2. Archive `plan.md`:
   - Create `.consilium/plans/` if it doesn't exist
   - Move `plan.md` to `.consilium/plans/<YYYY-MM-DD>-plan.md`
3. Summarize what was built and any open decisions left for the user.