Run the Consilium `/consult` workflow.

1. If the user hasn't stated a topic, ask what they need help with.
2. Based on the topic and current codebase context, suggest which specialists are relevant (e.g. security, performance). List them and ask the user to confirm before proceeding.
3. For each confirmed specialist:
   a. Call the specialist's `get_skill` MCP tool to retrieve their SKILL.md.
   b. Spawn a sub-agent with the following prompt:
      - System context: the full SKILL.md content
      - Task: the topic and any relevant codebase context
      The sub-agent should return concrete, actionable recommendations only.
   c. Record the sub-agent's response. The SKILL.md itself does not need to be retained.
4. If multiple specialists were consulted, identify conflicts between their recommendations:
   - Conflicts that are human judgment calls → surface as-is for the user to decide
   - Conflicts with an objectively better answer → reconcile into a single recommendation
5. Write `plan.md` with:
   - One section per specialist with their recommendations
   - **Conflicts / Tradeoffs** section (if applicable)
   - **Tasks** checklist for implementation