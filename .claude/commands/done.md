Run the Consilium `/done` workflow.

1. Read `plan.md`. If it doesn't exist, stop and tell the user there is nothing to finalize.
2. Bring back the specialists that contributed to the plan to review the generated code:
   - Call their `review` tool with the plan content and the relevant generated code
   - If a specialist rejects, address the feedback and retry until approved
3. Once all specialists approve (or if the user chooses to skip review), archive `plan.md`:
   - Create `.consilium/plans/` if it doesn't exist
   - Move `plan.md` to `.consilium/plans/<YYYY-MM-DD>-plan.md`
4. Summarize what was built, what was approved, and any open decisions left for the user.
