---
name: plan-ticket
description: "Plan a ticket before implementing it: add IDs and checks to its acceptance criteria, write the acceptance file and the contract/schema design, then stop for approval with a review page. Use at the start of a ticket, before any production code."
disable-model-invocation: true
---

Plan one ticket, passed as an identifier (for example `PROJ-123`). The plan exists so a human approves how each criterion will be proved before code exists. That is why you stop at the end without committing, and why you never edit an acceptance file that is already committed.

The formats are in `formatos/`: the criterion and the acceptance file (`aceite.md`), the plan commit message (`mensagem.md`), the route and table contract (`contrato.md`) and the test map (`mapa-de-testes.md`). The scripts are in `scripts/`.

## Steps

0. **Project values.** Read the keys with `git config --file .config/project --get-regexp '^(tickets|contrato|status)\.'`. If a key a step needs is missing, ask the person and propose the line, in the syntax of `git config`; a key the project leaves out on purpose (no contract) skips what uses it.

   | Value | Key | Used in |
   | --- | --- | --- |
   | Tickets folder | `tickets.pasta` | steps 1, 3, 5 and 6 |
   | Contract files | `contrato.arquivos` | step 4 |
   | In-progress status | `status.em-andamento` | step 1 |

1. **Context.** Fetch the ticket and its parent spec from the project's issue tracker. The parent issue's identifier (as `PROJ-1`) is the one to pass as `--pai` in step 5, and it names the ticket's folder (`formatos/aceite.md`, "Onde"). A ticket is always a sub-issue of its spec, including a follow-up of a spec already closed: if it has no parent, stop and ask for one to be set. Planning is starting the ticket, so move the issue to the in-progress status if it is not already there. Read the project documents the ticket touches and the code it will change, using the project's glossary, if it has one. Stop if a blocking ticket is not done, or if the ticket's acceptance file is already committed: the plan is frozen, and only the user unfreezes it. If the file exists but is not committed, it is an earlier run that was not approved yet: review and correct it, and keep its IDs, instead of writing it again.

2. **IDs and checks.** For each acceptance criterion without an ID, add the ID and a check mark as `formatos/aceite.md` describes, keeping the existing IDs as it says. Running the skill again on the same ticket must change nothing already there. Review any check marks already there, since they may have been set before planning. Do not change the text of a criterion on your own: when it became factually stale against the project documents (it describes a rule that a document already changed), put the proposed correction among the open decisions of the approval (step 5.4), and change the ticket only after the user approves it. Update the ticket in the issue tracker with the IDs and the marks.

3. **Acceptance file.** Create the ticket's acceptance file, where and in the format `formatos/aceite.md` says: an introduction and, for each ID, the check, the scenario (Dado, Quando, Então) and, for test checks, the planned test (layer, file, name). Use the highest seam that proves the criterion and the fewest seams overall.

4. **Design.** Write the contract changes straight into the contract files, which own them, and nothing into a parallel document. Every new or changed route and table follows `formatos/contrato.md`. The conventions and what does not exist yet stay in the project's documents. Without contract files, skip this step.

5. **Stop.** Do not commit.
   1. Write the proposed plan commit message to `<tickets folder>/<parent>/<ticket>/plano.msg`, complete and in the format of `formatos/mensagem.md`, with the attribution lines the project uses.
   2. Stage exactly the plan files with `git add`: the new acceptance file and every file the plan changed (the contract files, the documents), and nothing else. The page shows what is staged, which is what the plan commit will contain.
   3. Build the page by running, from the repository root, `scripts/plan-page.sh --pai <parent issue> --ticket <ticket>` from this skill's folder. It writes `<tickets folder>/<parent>/<ticket>/plano.html`. If it fails, fix what its message points at and run it again until it writes the page.
   4. Present the page to the user by whatever means you have: publish it, open it in a browser, or attach it. In the chat, show only the ticket, the path of the page and the decisions still open. Do not repeat the acceptance file, the contract or the message in the chat: they are in the page.
   5. Wait for the user's approval. Feedback comes in the chat, citing an ID or a tab; after a change, stage the changed files, write the message again if it changed and run step 3 again.

6. **Commit.** Only after the approval, check with `git status --short` that only the plan files are staged, and commit with `git commit -F <tickets folder>/<parent>/<ticket>/plano.msg`. Then run the page script again with the same arguments and `--commit "$(git rev-parse --short HEAD)"`, which rebuilds `plano.html` from the plan commit, and delete only `plano.msg`. If that run fails, delete `plano.html` too, so no page built from the index stays behind, and tell the user how to rebuild it once the cause is fixed.

Implementation starts in a new session, from the plan commit and the acceptance file.
