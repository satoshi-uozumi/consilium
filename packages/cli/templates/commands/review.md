---
name: cs:review
description: "Review a feature plan with specialists before implementation. Use after /cs:plan and before /cs:work."
effort: medium
argument-hint: <feature-name>
user-invocable: true
---

Run the Consilium `/cs:review` workflow.

1. Read `.consilium/plans/<feature-name>/plan.md`. If it doesn't exist, stop and tell the user to run `/cs:plan` first.
2. Identify which specialists contributed to the plan (from the specialist sections in the plan).
3. For each specialist, spawn a sub-agent. Do NOT read SKILL.md or call get_skill in this session — pass only the path or tool name to the sub-agent and let it retrieve the content itself.
   Sub-agent prompt must include:
   - For local specialists: "Read `.consilium/specialists/<name>/SKILL.md` and use it as your domain expertise. Do not summarise it — apply it."
   - For remote specialists: "Call `consilium-<name>:get_skill` to retrieve your SKILL.md and use it as your domain expertise."
   - "Read `.consilium/plans/<feature-name>/plan.md` and review it from your domain perspective. Return APPROVED or REJECTED with specific feedback."
   If the sub-agent returns REJECTED, surface the feedback to the user and ask whether to address it before proceeding.
4. Report the final verdict to the user. If all specialists approve, the plan is ready for `/cs:work`.