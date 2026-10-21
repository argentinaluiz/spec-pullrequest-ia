---
name: implement
description: "Implement one ticket in the session of its front, from its plan commit and acceptance file: tdd at the agreed seams, a commit, the sync mode of the worktree skill, the review skills, the full verification once in the background, and the delivery of the pull request when the user asks."
disable-model-invocation: true
---

Implement one ticket, in this session and in this checkout (the front of the ticket). The flow, step by step.

## Step 0: the project values

The values of the project live in its configuration file, `.config/project`, in the syntax of `git config`. Read the keys of this skill with `git config --file .config/project --get <key>` (`--get-all` for a list of patterns). Each value has a default for when the file does not give it, and a project with no file (or no such key) runs every value on its default:

| Value | Key | Default | Used in |
| --- | --- | --- | --- |
| Tickets folder | `tickets.pasta` | `docs/tickets` | step 2: where the acceptance file of the ticket lives |
| Code that asks for a conformance review | `revisao.sempre` and `revisao.com-aceite` | every change outside documents | step 7: when to call the conformance review (a change that matches `com-aceite` counts on a ticket with an acceptance file, and one that matches `sempre` always; patterns where `**` crosses the slashes) |
| Full verification | `verificacao.completa` | none: ask | step 8: the command that runs the complete verification |

Say in the chat, in one line, which values came from the default. A value that is `nenhum` skips the step that uses it. Ask the person only for a value that has no default, which is the full verification, and once agreed, propose the entry for the file. If the full verification command receives the body of the pull request, save the body first, with its acceptance section, and pass it as the command says.

## Steps

1. **Which ticket.** If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask. Take only a ticket whose blocking tickets are done.

2. **The plan.** The ticket needs a plan commit. Start from it and from its acceptance file (`<tickets folder>/<issue>/<ticket>/aceite.md`). If there is no plan commit, stop and ask for `/plan-ticket` first. The issue should already be in progress, because `/plan-ticket` moves it when planning starts; if it is not, move it now.

3. **Build it.** Call the Skill tool with "tdd" at the seams the plan agreed, putting each criterion ID in a tag of its acceptance test. A ticket with no test criterion has no `tdd`: deliver each criterion as its scenario describes. While working, run only the tests tied to the files you changed, with the commands the project gives for each part; a hook of the project may already run the type and lint checks.

4. **Escalate, do not decide.** Stop and ask when the implementation needs a decision that is not in the ticket or in the plan and that another ticket in progress would also take, or needs to change something another ticket in progress uses. The decisions the ticket takes from others, and who owns each, are in its section of decisions of other tickets.

5. **Commit.** Once the work is done, commit it to the current branch, which is never the main branch, without pushing: the next step needs a clean folder.

6. **Bring the main.** Call the Skill tool with "worktree" in its `sincronizar` mode, for the end of the ticket (its second ending): it merges the current main branch, adapts, commits the merge and gives control back, without reviewing, running the full verification or pushing. It comes before the reviews on purpose, so that they see the merged result, including what the merge adapted. It does nothing when nothing entered.

7. **Review.** Call the Skill tool with "simplify" and then with "code-review" to review the work. If the ticket has an acceptance file and the change alters the code that the value "Code that asks for a conformance review" names, call the Skill tool with "revisao-conformidade" to run the conformance review and triage its findings, as that skill describes, including its stop on a high-severity finding you would leave unfixed. Fix what you accept, and commit the fixes.

8. **Verify.** Run the full verification (the value) once, in the background, and never in a subagent. If the command receives the body of the pull request, save it first (step 0) and pass it again in every run after a fix. If the verification leads to fixes, commit them and run it again.

9. **Deliver, when the user asks.** With the full verification approved, stop and say the work is ready: the body of the pull request, the conformance review and the report of the sync. Do not push, open the pull request or publish anything before the user asks for it (as "suba a PR"). When they do: a plain `git push`, the pull request with the saved body plus the report of the sync (what entered, the conflicts, what was adapted), and the review comment, as the "Publish" part of `revisao-conformidade` describes. Never merge: the merge of the pull request is the user's. After the user merges, and only if they ask, the `remover` mode of the `worktree` skill takes the front of the ticket down; never with `--forcar`, which is the user's.
