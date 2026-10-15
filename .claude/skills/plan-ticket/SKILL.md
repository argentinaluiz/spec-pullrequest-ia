---
name: plan-ticket
description: "Plan a ticket before implementing it: add IDs and checks to its acceptance criteria, write the acceptance file and the contract/schema design, then stop for approval with a review page. Use at the start of a ticket, before any production code."
disable-model-invocation: true
---

Plan one ticket, passed as an identifier (for example `LUI-146`). The plan exists so a human approves how each criterion will be proved before code exists. That is why you stop at the end without committing, and why you never edit an acceptance file that is already committed.

This skill owns the plan formats, in its `formatos/` folder: the criterion and the acceptance file (`formatos/aceite.md`), the plan commit message (`formatos/mensagem.md`), and the route and table contract, with the output of the contract command (`formatos/contrato.md`). The project owns its values, declared in its `AGENTS.md` in the list of the plan skill, and the rules around the plan (who unfreezes, how the plan is checked). Read the project's `AGENTS.md` first and follow it where it adds to this skill.

The scripts are in `scripts/`, in this skill's folder. They need `git` and `bash` on the machine, and Node only through the project's Node command, so they work in any repository the skill folder is copied to.

## Steps

0. **Project values.** Read, in the project's `AGENTS.md`, the list of the plan skill: the acceptance folder, the tickets folder (ignored by the repository), the Node command, the contract command (or `nenhum`), the contract files and, optionally, the documents folder (where the project's documents live, so that their changes outside the index are flagged). If a required value is missing, ask the user before going on, and once agreed, propose the list for the `AGENTS.md`:
   - **Node command:** called as `<command> <script> <args>`, from the repository root, with repo-relative paths, and prints the script's output. `node` when Node runs on the machine; a wrapper when it runs in a container.
   - **Contract:** ask whether the project has routes or tables to plan. If it has, help define the contract: which files own it (an OpenAPI snapshot, a database schema), and a contract command, called as `<command> <from> <to>` with two git points (two commits, or `HEAD` and the index tree), that prints the Markdown of `formatos/contrato.md`. Those files are the contract files. If it has none, the contract command is `nenhum`, and the page says so.

1. **Context.** Fetch the ticket and its parent spec from the project's issue tracker. Read the project documents the ticket touches and the code it will change, using the project's glossary, if it has one. Stop if a blocking ticket is not done, or if `<acceptance folder>/<ticket>.md` is already committed: the plan is frozen, and only the user unfreezes it. If the file exists but is not committed, it is an earlier run that was not approved yet: review and correct it, and keep its IDs, instead of writing it again.

2. **IDs and checks.** For each acceptance criterion without an ID, add `**CA<n>**` and a check mark, as `formatos/aceite.md` describes, without changing the criterion text. Keep existing IDs: a new criterion takes the next number, and a removed one leaves its number vacant. Running the skill again on the same ticket must change nothing already there. Review any check marks already there, since they may have been set before planning. Update the ticket in the issue tracker.

3. **Acceptance file.** Create `<acceptance folder>/<ticket>.md` in the format of `formatos/aceite.md`: an introduction and, for each ID, the check, the scenario (Dado, Quando, Então) and, for test checks, the planned test (layer, file, name). Use the highest seam that proves the criterion and the fewest seams overall. Do not copy the criterion text.

4. **Design.** Write the contract changes straight into the contract files, which own them, and nothing into a parallel document. Every new or changed route and table follows `formatos/contrato.md`, with the project's details from the document its `AGENTS.md` points to. The conventions and what does not exist yet stay in the project's documents. With the contract `nenhum`, skip this step.

5. **Stop.** Do not commit.
   1. Write the proposed plan commit message to `<tickets folder>/<ticket>/plano.msg`, in the format of `formatos/mensagem.md`. It is the exact message the commit will get, so write it complete, with the attribution lines the project uses.
   2. Stage exactly the plan files with `git add`: the new acceptance file and every file the plan changed (the contract files, the documents), and nothing else. The page shows what is staged, which is what the plan commit will contain.
   3. Build the page by running, from the repository root, `scripts/plan-page.sh` from this skill's folder with the project's values: `--ticket <ticket> --aceite <acceptance folder> --tickets <tickets folder> --node "<Node command>" --contrato "<contract command>"` and, unless the contract is `nenhum`, `--contrato-arquivos "<contract files>"`, and `--documentos <documents folder>` when the project declares one. If the project declares a shortcut that passes those values, use it. The script cleans the message as `git commit` will, and writes `<tickets folder>/<ticket>/plano.html` from the index and that message. If it fails, read its message and fix what it points at (a missing argument, a missing message, the error of the contract command), then run it again until it writes the page.
   4. Present the page to the user by whatever means you have: publish it, open it in a browser, or attach it. In the chat, show only the ticket, the path of the page and the decisions still open. Do not repeat the acceptance file, the contract or the message in the chat: they are in the page.
   5. Wait for the user's approval. Feedback comes in the chat, citing an ID or a tab; after a change, stage the changed files, write the message again if it changed and run step 3 again.

6. **Commit.** Only after the approval, check with `git status --short` that only the plan files are staged, and commit with `git commit -F <tickets folder>/<ticket>/plano.msg`, so the approved message is the commit message without a copy. Then run the page script again with the same values and `--commit "$(git rev-parse --short HEAD)"`, which rebuilds `plano.html` from the plan commit, and delete only `plano.msg`: it is now the commit message, shown in full in the page. If that run fails, delete `plano.html` too, so no page built from the index stays behind, and tell the user how to rebuild it once the cause is fixed. The page stays in the ticket folder, out of version control, citing the plan commit; a plan made again overwrites it.

Implementation starts in a new session, from the plan commit and the acceptance file.

## The page

A static HTML file, with its CSS inside, CSS tabs and expandable parts, no script, no form and no external resource, in light and dark themes. Every text from the sources is escaped. Both modes of the script (from the index, or `--commit`) build the same page, save the line that says where it was built from.

| Tab | Source |
| --- | --- |
| Aceite | The acceptance file, read by `scripts/plan.cjs`: the introduction and one row per ID, with the check and the scenario, and the planned test in an expandable part |
| Contrato | The `# Contrato` section of the contract command's Markdown, or that the project declares no contract |
| Schema | The `# Schema` section of the same Markdown, or that the project declares no contract |
| Documentos | The diff, per file, of everything the plan changes outside its own acceptance file and the contract files, including another ticket's frozen acceptance file |
| Arquivos e interfaces | The `Files and interfaces the implementation will touch:`, `Existing tests whose behavior changes:` and `Data changes:` blocks of the message |
| Decisões | The `Decision:` blocks of the message, and the whole message in an expandable part |

When the working tree has changes outside the index that look like part of the plan, the script lists them in the terminal and in a notice at the top of the page, without failing: the page and the plan commit read only the index. Which changes count is in the header of `scripts/plan-page.sh`; other work in progress elsewhere in the working tree does not.
