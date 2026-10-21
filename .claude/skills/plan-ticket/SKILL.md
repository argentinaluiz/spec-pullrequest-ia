---
name: plan-ticket
description: "Plan a ticket before implementing it: add IDs and checks to its acceptance criteria, write the acceptance file and the contract/schema design, then stop for approval with a review page. Use at the start of a ticket, before any production code."
disable-model-invocation: true
---

Plan one ticket, passed as an identifier (for example `PROJ-123`). The plan exists so a human approves how each criterion will be proved before code exists. That is why you stop at the end without committing, and why you never edit an acceptance file that is already committed.

This skill owns the plan formats, in its `formatos/` folder: the criterion and the acceptance file (`formatos/aceite.md`), the plan commit message (`formatos/mensagem.md`), and the route and table contract, with the output of the contract command (`formatos/contrato.md`). The values of the project are read in step 0.

This skill also owns the pieces that depend on those formats, which live in its folder: the acceptance checker (`scripts/check-acceptance.cjs`), the freeze hook (`hooks/freeze-acceptance.sh`) and the test map (`formatos/mapa-de-testes.md`). See "The test map" below.

The scripts are in `scripts/`, in this skill's folder. They need `git` and `bash` on the machine, and Node only through the project's Node command, so they work in any repository the skill folder is copied to.

## Steps

0. **Project values.** The values of the project live in its configuration file, `.config/project`, in the syntax of `git config`. Read the keys of this skill in one call, `git config --file .config/project --get-regexp '^(tickets|node|contrato|plano)\.'`, which prints a line per value. Each has a default for when the file does not give it, and a project with no file (or no such key) runs every value on its default:

   | Value | Key | Default | Used in |
   | --- | --- | --- | --- |
   | Tickets folder | `tickets.pasta` | `docs/tickets` | everything: where each ticket's acceptance file and test map live (`formatos/aceite.md`, "Onde") |
   | Documents folder | `tickets.documentos` | `nenhum` | step 5.3: the project documents whose changes outside the index are flagged |
   | Node command | `node.comando` | `node` | step 5.3: how the page script runs Node |
   | Contract command | `contrato.comando` | `nenhum` | steps 4 and 5.3: the readable view of the contract |
   | Contract files | `contrato.arquivos` | `nenhum` | steps 4 and 5.3: the files that own the contract |
   | Shortcut of the page | `plano.atalho` | `nenhum` | step 5.3: a command that runs the page script with the other values |

   Say in the chat which values came from the default, in one line. A value that is `nenhum` skips the step that uses it (no contract command or no contract files: no contract step, and the page says the project declares none; no documents folder: no flag for documents). Ask the user only for a value that has no default, and once agreed, propose the entry for the file. The values mean:
   - **Node command:** called as `<command> <script> -`, from the repository root, with the script's path relative to it (absolute when the skill folder is outside the repository), the page sources on standard input (their format is in the header of `scripts/page.cjs`), and prints the script's output. `node` when Node runs on the machine; a wrapper when it runs in a container, which must pass standard input through and see the script at that path. A wrapper that only sees the repository does not fit a skill installed outside it: use another Node command there, such as `node` on the machine.
   - **Shortcut of the page:** called as `<shortcut> <parent issue> <ticket> [<plan commit>]`; it runs the page script with the values above.
   - **Contract:** the contract command is called as `<command> <from> <to>` with two git points (two commits, or `HEAD` and the index tree), and prints the Markdown of `formatos/contrato.md`; the contract files are the ones that own it (an OpenAPI snapshot, a database schema). A project with routes or tables to plan declares both; one without declares neither.

1. **Context.** Fetch the ticket and its parent spec from the project's issue tracker. The parent issue's identifier (as `PROJ-1`) is the one to pass as `--pai` in step 5, and it names the ticket's folder (`formatos/aceite.md`, "Onde"). A ticket is always a sub-issue of its spec, including a follow-up of a spec already closed: if it has no parent, stop and ask for one to be set. Planning is starting the ticket, so move the issue to "In Progress" if it is not already there. Read the project documents the ticket touches and the code it will change, using the project's glossary, if it has one. Stop if a blocking ticket is not done, or if the ticket's acceptance file is already committed: the plan is frozen, and only the user unfreezes it. If the file exists but is not committed, it is an earlier run that was not approved yet: review and correct it, and keep its IDs, instead of writing it again.

2. **IDs and checks.** For each acceptance criterion without an ID, add `**CA<n>**` and a check mark, as `formatos/aceite.md` describes, without changing the criterion text. The ID and the check mark of a criterion never change; the text changes only when it became factually stale against the project documents (for example, it describes a rule that a document already changed): do not rewrite it on your own, put the proposed correction among the open decisions of the approval (step 5.4), and change the ticket only after the user approves it. Keep existing IDs: a new criterion takes the next number, and a removed one leaves its number vacant. Running the skill again on the same ticket must change nothing already there. Review any check marks already there, since they may have been set before planning. Update the ticket in the issue tracker with the IDs and the marks, and with the corrected text only after the approval.

3. **Acceptance file.** Create the ticket's acceptance file, where and in the format `formatos/aceite.md` says: an introduction and, for each ID, the check, the scenario (Dado, Quando, Então) and, for test checks, the planned test (layer, file, name). Use the highest seam that proves the criterion and the fewest seams overall. Do not copy the criterion text.

4. **Design.** Write the contract changes straight into the contract files, which own them, and nothing into a parallel document. Every new or changed route and table follows `formatos/contrato.md`. The conventions and what does not exist yet stay in the project's documents. With the contract `nenhum`, skip this step.

5. **Stop.** Do not commit.
   1. Write the proposed plan commit message to `<tickets folder>/<parent>/<ticket>/plano.msg`, in the format of `formatos/mensagem.md`. It is the exact message the commit will get, so write it complete, with the attribution lines the project uses.
   2. Stage exactly the plan files with `git add`: the new acceptance file and every file the plan changed (the contract files, the documents), and nothing else. The page shows what is staged, which is what the plan commit will contain.
   3. Build the page by running, from the repository root, `scripts/plan-page.sh` from this skill's folder with the project's values: `--pai <parent issue> --ticket <ticket> --tickets <tickets folder> --node "<Node command>" --contrato "<contract command>"` and, unless the contract is `nenhum`, `--contrato-arquivos "<contract files>"`, and `--documentos <documents folder>` when the project declares one. If the project sets the shortcut of the page, use it: it passes those values. The script cleans the message as `git commit` will, and writes `<tickets folder>/<parent>/<ticket>/plano.html` from the index and that message. If it fails, read its message and fix what it points at (a missing argument, a missing message, the `.gitignore` rules of the tickets folder, the error of the contract command), then run it again until it writes the page.
   4. Present the page to the user by whatever means you have: publish it, open it in a browser, or attach it. In the chat, show only the ticket, the path of the page and the decisions still open. Do not repeat the acceptance file, the contract or the message in the chat: they are in the page.
   5. Wait for the user's approval. Feedback comes in the chat, citing an ID or a tab; after a change, stage the changed files, write the message again if it changed and run step 3 again.

6. **Commit.** Only after the approval, check with `git status --short` that only the plan files are staged, and commit with `git commit -F <tickets folder>/<parent>/<ticket>/plano.msg`, so the approved message is the commit message without a copy. Then run the page script again with the same values and `--commit "$(git rev-parse --short HEAD)"`, which rebuilds `plano.html` from the plan commit, and delete only `plano.msg`: it is now the commit message, shown in full in the page. If that run fails, delete `plano.html` too, so no page built from the index stays behind, and tell the user how to rebuild it once the cause is fixed. The page stays in the ticket folder, out of version control, citing the plan commit; a plan made again overwrites it.

Implementation starts in a new session, from the plan commit and the acceptance file.

## The test map

A test of a general-purpose skill cannot carry the ID of a criterion of the project: the skill is copied to other projects. The link between the criterion and that test lives in the **test map** of the ticket, `mapa-de-testes.txt`, in the ticket's folder next to its acceptance file (the format is in `formatos/mapa-de-testes.md`). The checker treats each line of the map as the tag of its case, so the criterion is covered only when the case ran and passed. A test of the project keeps the ID in its tag. The acceptance file stays frozen: the map is the living part of the link.

**When the checker accuses** a criterion without a test, or a case of the map that did not run (or an ID of the map that no acceptance file has), the agent finds the case by the "Teste previsto" of the criterion in the acceptance file:
1. Search the test files for the name or the file it gives.
2. **Exactly one candidate:** write the line in the map of the ticket (create the map if the ticket has none) and run the checker again.
3. **None, or more than one:** show the candidates (file and name of each) to the person and ask which one proves the criterion. Write the line with the answer.

The `tdd` skill writes the line itself when it writes a test of a skill that proves a criterion.

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
