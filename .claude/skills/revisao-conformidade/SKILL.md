---
name: revisao-conformidade
description: "Run the conformance review of a change that needs one: prepare its inputs with the script of this skill, call the reviewer with paths only, record and triage the findings, then publish them as a pull request comment. Use after the code review and before the full verification, and again when the pull request is opened."
---

The skill has two parts: **Review**, and **Publish**, when the pull request exists, which may be in another session.

## Steps

0. **Project values.** Read the keys with `git config --file .config/project --get-regexp '^(tickets|revisao)\.'`. If a key a step needs is missing, ask the person and propose the line, in the syntax of `git config`.

   | Value | Key | Used in |
   | --- | --- | --- |
   | Tickets folder | `tickets.pasta` | step 1 and Publish |
   | Reviewer | `revisao.revisor`; without it, `revisor-conformidade` | step 3 |

## Review

1. **Folder.** With a ticket, the review lives in the ticket's folder, `<tickets folder>/<pai>/<ticket>/`, next to its acceptance file. Without a ticket, it lives in `<tickets folder>/sem-ticket/<nome>/`, with a short lowercase name you choose (letters, digits and hyphens). Without a ticket, first write the acceptance criteria of the change in `criterios.md` in that folder, one numbered criterion per line, from what was asked and not from what was done.

2. **Inputs.** Run the script of this skill, from anywhere in the repository:

   ```bash
   <skill folder>/scripts/review-inputs.sh <pai> <ticket>    # with a ticket
   <skill folder>/scripts/review-inputs.sh sem-ticket <nome>  # without one
   ```

   It says first whether the change asks for a review, and why. If it does not (exit 3), say so and stop: there is nothing to review. Otherwise it writes the inputs in the review folder and prints their lines. If it fails, do what its message says. Read the list of files the diff adds, committed or not: a file the change created that is not there is ignored by Git, and stays out of the review.

3. **Call the reviewer.** Call the reviewer subagent of step 0 with only the input lines the script printed. Do not add your summary of the change, your opinion of it or what you think deserves attention: the value of the review is that it does not start from your conclusions. Run it in the branch checkout, because it reads the branch's acceptance file and test map.

4. **Record.** As soon as the reviewer returns, write `revisao.md` in the same folder, in the format below, with its report verbatim inside `<details>` and one table row per finding. Do not omit a finding nor edit the report. With no findings, write the file anyway, with the table empty and the report.

5. **Triage.** Decide each finding and fill its row:
   - **Agree:** fix it. The situation is `Corrigido`, and the reason says what changed.
   - **Disagree:** the situation is `Não corrigido`, and the reason says why it stays as it is.
   - **High severity you would leave unfixed:** stop and ask the user before going on. Write the decision and that it was the user's in the reason. The review does not stop the verification or the pull request, and the user decides at the merge what stayed unfixed; this is the one case where the agent stops and asks first.

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

In an agent that cannot call a subagent, or in a project that did not install the reviewer among its agents, run the review in a new session, with the instructions of `revisor.md` in this folder and the same inputs, and record and publish it the same way.
