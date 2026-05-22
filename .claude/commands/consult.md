Run the Consilium `/consult` workflow.

1. If the user hasn't stated a topic, ask what they need help with.
2. Based on the topic and current codebase context, suggest which specialists are relevant (e.g. security, performance). List them and ask the user to confirm before calling any specialist.
3. For each confirmed specialist, call their `consult` tool with the topic and relevant context from the codebase.
4. Collect all responses. If multiple specialists were consulted, identify conflicts between their recommendations:
   - Conflicts that are human judgment calls → surface as-is for the user to decide
   - Conflicts with an objectively better answer → mediate and produce a single reconciled recommendation
5. Write `plan.md` with:
   - One section per specialist with their recommendations
   - **Conflicts / Tradeoffs** section (if applicable)
   - **Tasks** checklist for implementation