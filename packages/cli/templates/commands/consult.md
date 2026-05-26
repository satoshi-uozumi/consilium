---
name: cs:consult
description: "Consult specialists and produce a feature plan. Use when starting work on a new feature that spans multiple domains."
effort: high
argument-hint: <feature description>
user-invocable: true
---

Run the Consilium `/cs:consult` workflow.

1. Derive a short kebab-case slug from the feature description (e.g. "user authentication" → `user-auth`). This slug is the feature name used throughout.
2. If the user hasn't stated a topic, ask what they need help with.
3. Based on the topic and current codebase context, suggest which specialists are relevant (e.g. security, performance). List them and ask the user to confirm before proceeding.
   - If the confirmed list has exactly 4 specialists: warn the user — "4 specialists is the recommended maximum; synthesis quality degrades beyond this. Proceed?" — and wait for confirmation.
   - If the confirmed list has 5 or more specialists: warn the user — "5+ specialists is strongly discouraged; conflict synthesis becomes unreliable and expensive. Type 'override' to proceed anyway, or narrow the list." — and wait. Only continue if the user explicitly types 'override'.
4. Use Grep/Glob to identify the relevant files for this feature, read them, and include the content in each sub-agent prompt. Tell the user which files you are passing as context. If the user prefers sub-agents to explore the codebase themselves (this session stays cleaner), they can say so and you skip this step.
5. For each confirmed specialist, spawn a sub-agent. Do NOT read SKILL.md or call get_skill in this session — pass only the path or tool name to the sub-agent and let it retrieve the content itself.
   Sub-agent prompt must include:
   - For local specialists: "Read `.consilium/specialists/<name>/SKILL.md` and use it as your domain expertise. Do not summarise it — apply it."
   - For remote specialists: "Call `consilium-<name>:get_skill` to retrieve your SKILL.md and use it as your domain expertise."
   - The feature description and relevant codebase context (either pre-curated by main Claude or instructions to explore)
   - "Return concrete, actionable recommendations only."
   Record only the sub-agent's distilled response. If you find yourself reading a SKILL.md file in this session, stop — you are doing it wrong.
6. If multiple specialists were consulted, identify conflicts between their recommendations:
   - Conflicts that are human judgment calls → surface as-is for the user to decide
   - Conflicts with an objectively better answer → reconcile into a single recommendation
7. Write `.consilium/plans/<feature-name>/plan.md` with:
   - One section per specialist with their recommendations
   - **Conflicts / Tradeoffs** section (if applicable)
   - **Tasks** checklist for implementation