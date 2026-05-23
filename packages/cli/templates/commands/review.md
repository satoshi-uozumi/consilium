Run the Consilium `/review` workflow.

1. Read `plan.md`. If it doesn't exist, stop and tell the user to run `/consult` first.
2. Identify which specialists contributed to the plan (from the specialist sections in `plan.md`).
3. For each specialist, review the plan:
   a. Call their `get_skill` MCP tool to retrieve their SKILL.md.
   b. Spawn a sub-agent with the following context:
      - System context: the full SKILL.md content
      - Task: review the plan below from your domain perspective — return APPROVED or REJECTED with specific feedback
      Include the full `plan.md` content in the task.
   c. If the sub-agent returns REJECTED, surface the feedback to the user and ask whether to address it before proceeding.
4. Report the final verdict to the user. If all specialists approve, the plan is ready for `/work`.