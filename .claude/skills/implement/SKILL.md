---
name: implement
description: "Implement one ticket in the session of its front, from its plan commit and acceptance file: tdd at the agreed seams, the review skills, the sync skill before the full, the full once in the background, and the commit."
disable-model-invocation: true
---

Implement one ticket, in this session and in this checkout (the front of the ticket). The flow, step by step; the rules around it are in the root `AGENTS.md`.

1. **Which ticket.** If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask. Take only a ticket whose blocking tickets are done.

2. **The plan.** The ticket needs a plan commit. Start from it and from its acceptance file (`docs/tickets/<issue>/<ticket>/aceite.md`), as the root `AGENTS.md`, section "Plano do ticket", describes. If there is no plan commit, stop and ask for `/plan-ticket` first. Move the issue to "In Progress".

3. **Build it.** Call the Skill tool with "tdd" at the seams the plan agreed, putting each criterion ID in a tag of its acceptance test. A ticket with no test criterion has no `tdd`: deliver each criterion as its scenario describes. While working, run only the tests tied to the files you changed, with the commands of the `AGENTS.md` of each project; the stop hook already runs the type and lint checks.

4. **Escalate, do not decide.** Stop and ask when the implementation needs a decision that is not in the ticket or in the plan and that another ticket in progress would also take, or needs to change something another ticket in progress uses (the escalation rule of the root `AGENTS.md`, "Ao trabalhar em um ticket"). The decisions the ticket takes from others, and who owns each, are in its section "Decisões de outros tickets".

5. **Review.** Once done, call the Skill tool with "simplify" and then with "code-review" to review the work. If the change alters code in `apps/`, call the Skill tool with "revisao-conformidade" to run the conformance review and triage its findings, as that skill describes. Fix what you accept.

6. **Bring the main.** Call the Skill tool with "sincronizar", so that the single complete verification of the task runs against the current `main`. It does nothing when nothing entered.

7. **Verify.** Run `scripts/verify.sh full` once, in the background, before the commit that closes the work, as the root `AGENTS.md`, section "Definição de pronto", describes. A subagent never runs it.

8. **Commit.** Commit your work to the current branch, which is never `main`. The push, the pull request and the merge come after the `full`, as the root `AGENTS.md` describes; do not merge a pull request unless the user asked for it.
