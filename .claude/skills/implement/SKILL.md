---
name: implement
description: "Implement one ticket in the session of its front, from its plan commit and acceptance file: tdd at the agreed seams, a commit, the sync skill, the review skills, the full once in the background, and the delivery of the pull request when the user asks."
disable-model-invocation: true
---

Implement one ticket, in this session and in this checkout (the front of the ticket). The flow, step by step; the rules around it are in the root `AGENTS.md`.

1. **Which ticket.** If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask. Take only a ticket whose blocking tickets are done.

2. **The plan.** The ticket needs a plan commit. Start from it and from its acceptance file (`docs/tickets/<issue>/<ticket>/aceite.md`), as the root `AGENTS.md`, section "Plano do ticket", describes. If there is no plan commit, stop and ask for `/plan-ticket` first. The issue should already be "In Progress", because `/plan-ticket` moves it when planning starts; if it is not, move it now.

3. **Build it.** Call the Skill tool with "tdd" at the seams the plan agreed, putting each criterion ID in a tag of its acceptance test. A ticket with no test criterion has no `tdd`: deliver each criterion as its scenario describes. While working, run only the tests tied to the files you changed, with the commands of the `AGENTS.md` of each project; the stop hook already runs the type and lint checks.

4. **Escalate, do not decide.** Stop and ask when the implementation needs a decision that is not in the ticket or in the plan and that another ticket in progress would also take, or needs to change something another ticket in progress uses (the escalation rule of the root `AGENTS.md`, "Ao trabalhar em um ticket"). The decisions the ticket takes from others, and who owns each, are in its section "Decisões de outros tickets".

5. **Commit.** Once the work is done, commit it to the current branch, which is never the principal branch, without pushing: the next step needs a clean folder.

6. **Bring the main.** Call the Skill tool with "worktree" in its `sincronizar` mode, for the end of the ticket (its second ending): it merges the current principal branch, adapts, commits the merge and gives control back, without reviewing, running the `full` or pushing. It comes before the reviews on purpose, so that they see the merged result, including what the merge adapted. It does nothing when nothing entered.

7. **Review.** Call the Skill tool with "simplify" and then with "code-review" to review the work. If the ticket has an acceptance file and the change alters the code that the project says asks for a conformance review (the value "Código que pede revisão" of the project values), call the Skill tool with "revisao-conformidade" to run the conformance review and triage its findings, as that skill describes, including its stop on a high-severity finding you would leave unfixed. Fix what you accept, and commit the fixes.

8. **Verify.** Run `.claude/skills/verificar/scripts/verify.sh full` once, in the background, as the root `AGENTS.md`, section "Definição de pronto", describes. If the branch changes `apps/`, save the body of the pull request, with its `## Aceite` section, in a file and pass it as `ACCEPTANCE_BODY_FILE=<file>`, here and in every run after a fix: without it the `full` records the acceptance as skipped and the push hook refuses the approval, which would need another complete run ("Antes do push" of that file). If the `full` leads to fixes, commit them and run it again. A subagent never runs it.

9. **Deliver, when the user asks.** With the `full` approved, stop and say the work is ready: the body of the pull request, the conformance review and the report of the sync. Do not push, open the pull request or publish anything before the user asks for it (as "suba a PR"). When they do: a plain `git push`, the pull request with the saved body plus the report of the sync (what entered, the conflicts, what was adapted), and the review comment, as the "Publish" part of `revisao-conformidade` describes. The merge of the pull request is the user's, as the root `AGENTS.md`, section "Convenções de Git", says: this skill never merges. After the user merges, and only if they ask, the `remover` mode of the `worktree` skill takes the front of the ticket down; never with `--forcar`, which is the user's.
