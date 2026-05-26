---
name: cs:review
description: "Review a feature plan with specialists before implementation. Use after /cs:consult and before /cs:work."
effort: medium
argument-hint: <feature-name>
user-invocable: true
---

Run the Consilium `/cs:review` workflow.

1. Read `.consilium/plans/<feature-name>/plan.md`. If it doesn't exist, stop and tell the user to run `/cs:consult` first.
2. Identify which specialists contributed to the plan (from the specialist sections in the plan).
3. For each specialist, review the plan:
   a. Retrieve their SKILL.md: call `consilium-<name>:get_skill` if the MCP tool is available in this session; otherwise read `.consilium/specialists/<name>/SKILL.md` directly. Either way the content goes only to the sub-agent — never into this session's context.
   b. Spawn a sub-agent with the following context:
      - System context: the full SKILL.md content
      - Task: review the plan below from your domain perspective — return APPROVED or REJECTED with specific feedback
      Include the full `.consilium/plans/<feature-name>/plan.md` content in the task.
   c. If the sub-agent returns REJECTED, surface the feedback to the user and ask whether to address it before proceeding.
4. Report the final verdict to the user. If all specialists approve, the plan is ready for `/cs:work`.