---
name: revisao-conformidade
description: "Run the conformance review of a change that needs one: prepare its inputs with the script of this skill, call the reviewer with paths only, record and triage the findings, then publish them as a pull request comment. Use after the code review and before the full verification, and again when the pull request is opened."
---

How to run the conformance review that the project requires, and what to do with its result. The project's rules (who reviews, when, and that the review is not a mechanical gate) are in its agent instructions file; what the reviewer checks is in the model of the reviewer, `revisor.md` in this folder, and in the project's review rules document, if it has one. The skill names roles, so it works in any repository the folder is copied to.

The skill has two parts, at two moments: **Review**, after the code review and before the full verification, so the fixes go into the single full verification; and **Publish**, when the pull request exists, which may be in another session.

## Steps

0. **Project values.** Read, in the project's agent instructions file, the list "Valores das skills do ticket", the entries of this skill. The skill uses these values, and each has a default for when the list does not give it:

   | Value | Default | Used in |
   | --- | --- | --- |
   | Tickets folder | `docs/tickets` | the review folder of each ticket (`--tickets` of the script) |
   | Base | the main branch of the origin remote, `origin/<branch>` | the diff and the plan commit (`--base` of the script) |
   | Code that asks for a review | every change outside documents | when to run the review at all |
   | Reviewer | `revisor-conformidade` | step 3: the subagent to call |
   | Contract drift | `nenhum` | step 2: the command that tells the drift since the plan commit (`--desvio` of the script) |

   Say in the chat which values came from the default, in one line. A value that is `nenhum` skips the step that uses it (no drift command: the drift file says none was declared). If the change does not touch the code that asks for a review, say so and stop: there is nothing to review. The drift command is called as `<command> <plan commit> <to, or empty> <drift file>`: it appends the view of the drift to the file and only warns.

## Review

1. **Folder.** With a ticket, the review lives in the ticket's folder, `<tickets folder>/<pai>/<ticket>/`, next to its acceptance file. Without a ticket, it lives in `<tickets folder>/sem-ticket/<nome>/`, with a short lowercase name you choose (letters, digits and hyphens). Without a ticket, first write the acceptance criteria of the change in `criterios.md` in that folder, one numbered criterion per line, from what was asked and not from what was done. The script refuses to run without it.

2. **Inputs.** Run the script of this skill (`<skill folder>/scripts/review-inputs.sh`, from anywhere in the repository), with the values of step 0:

   ```bash
   review-inputs.sh [--tickets <folder>] [--base <ref>] [--desvio <command>] <pai> <ticket>    # with a ticket
   scripts/review-inputs.sh [--tickets <folder>] [--base <ref>] [--desvio <command>] sem-ticket <nome>  # without one
   ```

   It writes, in the review folder, `review.diff` (everything the branch changed since it left the base, up to the working tree, with every new file Git does not ignore) and, with a ticket, `plano.txt` (the plan commit message) and `contract-drift.txt` (the contract and schema drift since the plan commit, always written; a drift command that fails leaves there that the drift was not checked). It fails, and says what to do, when the ticket has no plan commit, when `criterios.md` is missing, when the base does not exist, or when the inputs would not be ignored by Git. Read the list of files the diff adds, committed or not: a file the change created that is not there is ignored by Git, and stays out of the review.

3. **Call the reviewer.** Call the reviewer subagent of step 0 with only the input lines the script printed: the path of the diff, the ticket identifier and the paths of the plan message and the contract drift, or, without a ticket, the path of `criterios.md` and the notice that there is no plan commit. Do not add your summary of the change, your opinion of it or what you think deserves attention: the value of the review is that it does not start from your conclusions. Run it in the branch checkout, because it reads the branch's acceptance file and test map. The project installs the subagent among its agents, as a copy of `revisor.md` with the agent header and the tracker tool; that copy is the one that runs, so a change to the model must be copied to it.

4. **Record.** As soon as the reviewer returns, write `revisao.md` in the same folder, in the format below, with its report verbatim inside `<details>` and one table row per finding. Do not omit a finding nor edit the report. With no findings, write the file anyway, with the table empty and the report. The script only writes where Git ignores the files, so none of them goes to a commit.

5. **Triage.** Decide each finding and fill its row:
   - **Agree:** fix it. The situation is `Corrigido`, and the reason says what changed.
   - **Disagree:** the situation is `Não corrigido`, and the reason says why it stays as it is.
   - **High severity you would leave unfixed:** stop and ask the user before going on. Write the decision and that it was the user's in the reason. The review is not a mechanical gate (it does not stop the verification or the pull request, and the user decides at the merge what stayed unfixed), but this is the one case where the agent stops and asks first.

   When the review runs inside the implementation flow, the session fixes the findings of the code review and the ones accepted here. The commit after the fixes does not go through the reviewer again: the full verification checks it.

6. **Go on** to the full verification, as the project's agent instructions file says. In the implementation flow, that is after this review and the fixes; the sync with the main branch already ran, before the reviews, so the review sees the merged result.

## Publish

When the pull request exists, post each `revisao.md` of the branch as one comment, one per ticket. The file is local and ignored by Git, so publish from the checkout where the review ran; if it is missing (another checkout, a cleaned worktree), run the review again instead of writing the comment from memory.

```bash
gh pr comment <pr> --body-file <tickets folder>/<pai>/<ticket>/revisao.md
```

Add `--repo <owner>/<repo>` when the pull request is not on the default remote. If the pull request already has the comment of that ticket, edit it instead of posting a second one: find its id by the title, then replace its body.

```bash
gh api repos/<owner>/<repo>/issues/<pr>/comments --paginate \
  --jq '.[] | select(.body | startswith("## Revisão de conformidade: <ticket>\n")) | .id'
gh api -X PATCH repos/<owner>/<repo>/issues/comments/<id> -F body=@<tickets folder>/<pai>/<ticket>/revisao.md
```

The comment is the record that the project's agent instructions file asks for.

## Format of `revisao.md`

The title names the ticket, or `sem ticket (<nome>)` for a change without one.

```markdown
## Revisão de conformidade: <ticket>

| # | Severidade | Achado | Situação | Motivo |
| --- | --- | --- | --- | --- |
| 1 | alta | O que o revisor apontou | Corrigido | O que mudou |
| 2 | média | O que o revisor apontou | Não corrigido | Por que ficou como está |

<details>
<summary>Relatório do revisor, na íntegra</summary>

(o relatório, sem edição)

</details>
```

## Without the installed subagent

In an agent that cannot call a subagent, or in a project that did not install the copy, run the review in a new session, with the instructions of `revisor.md` in this folder and the same inputs, and record and publish it the same way.
