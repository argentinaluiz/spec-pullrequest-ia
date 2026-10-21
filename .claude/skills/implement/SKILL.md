---
name: implement
description: "Implement one ticket in the session of its front, from its plan commit and acceptance file: tdd at the agreed seams, a commit, the sync mode of the worktree skill, the review skills, the full verification once in the background, and the delivery of the pull request when the user asks."
disable-model-invocation: true
---

Implement one ticket, in this session and in this checkout (the front of the ticket). The flow, step by step.

## Step 0: the project values

Read the keys of this skill from the project's configuration file, with `git config --file .config/project --get-regexp '^(tickets|status|verificacao)\.'`. If a key a step needs is missing, ask the person and propose the line for the file, in the syntax of `git config`.

| Value | Key | Used in |
| --- | --- | --- |
| Tickets folder | `tickets.pasta` | step 2: where the acceptance file of the ticket lives |
| In-progress status | `status.em-andamento` | step 2: the status of the issue while it is built |
| Full verification | `verificacao.completa` | step 8: the command that runs the complete verification |

If the full verification command receives the body of the pull request, save the body first, with its acceptance section, and pass it as the command says.

## Steps

1. **Which ticket.** If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask. Take only a ticket whose blocking tickets are done.

2. **The plan.** The ticket needs a plan commit. Start from it and from its acceptance file (`<tickets folder>/<issue>/<ticket>/aceite.md`). If there is no plan commit, stop and ask for `/plan-ticket` first. The issue should already be in the in-progress status, because `/plan-ticket` moves it when planning starts; if it is not, move it now.

3. **Build it.** Call the Skill tool with "tdd", which takes the seams and the list of tests from the acceptance file of the plan. A ticket with no test criterion has no `tdd`: deliver each criterion as its scenario describes. While working, run only the tests tied to the files you changed, with the commands the project gives for each part; a hook of the project may already run the type and lint checks.

4. **Escalate, do not decide.** Stop and ask when the implementation needs a decision that is not in the ticket or in the plan and that another ticket in progress would also take, or needs to change something another ticket in progress uses. The decisions the ticket takes from others, and who owns each, are in its section of decisions of other tickets.

5. **Commit.** Once the work is done, commit it to the current branch, which is never the main branch, without pushing: the next step needs a clean folder.

6. **Bring the main.** Call the Skill tool with "worktree" in its `sincronizar` mode, saying that `/implement` calls it at the end of the build: the mode knows what to do then, and gives control back. It comes before the reviews on purpose, so that they see the merged result, including what the merge adapted.

7. **Review.** Call the Skill tool with "simplify" and then with "code-review" to review the work. Then call the Skill tool with "revisao-conformidade", which decides whether the change asks for a conformance review, runs it and triages its findings, as that skill describes. Fix what you accept, and commit the fixes.

8. **Verify.** Run the full verification (the value) once, in the background, and never in a subagent: a subagent ends with the tests of what it changed and gives the result back, and the full verification is the one of who closes the task. If the command receives the body of the pull request, save it first (step 0) and pass it again in every run after a fix. If the verification leads to fixes, commit them and run it again.

9. **Deliver, when the user asks.** With the full verification approved, stop and say the work is ready: the body of the pull request, the conformance review and the report of the sync. Do not push, open the pull request or publish anything before the user asks for it (as "suba a PR"). When they do: a plain `git push`, the pull request with the saved body plus the report of the sync (what entered, the conflicts, what was adapted), and the review comment, as the "Publish" part of `revisao-conformidade` describes. Do not merge: the merge of the pull request is the user's decision, and the project's instructions say when, if ever, the agent may do it. After the user merges, and only if they ask, the `remover` mode of the `worktree` skill takes the front of the ticket down.
