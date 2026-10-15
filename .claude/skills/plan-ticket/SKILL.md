---
name: plan-ticket
description: "Plan a Linear ticket before implementing it: add IDs and checks to its acceptance criteria, write the acceptance file and the contract/schema design, then stop for approval. Use at the start of a ticket, before any production code."
disable-model-invocation: true
---

Plan one ticket, passed as an identifier (for example `LUI-146`). The rules and the formats (criterion ID, checks, acceptance file, frozen plan) are owned by the root `AGENTS.md`, section "Plano do ticket". The design and the reasons are in `docs/harness.md`, section "Plano do ticket (planejado)". Read both first and follow them; this skill only gives the order of the steps.

The plan exists so a human approves how each criterion will be proved before code exists. That is why you stop at the end without committing, and why you never edit an acceptance file that is already committed.

## Steps

1. **Read.** Fetch the ticket and its parent spec from Linear. Read the sections of `docs/lld.md` the ticket touches and the code it will change, using the project's `GLOSSARY.md` vocabulary. Stop if a blocking ticket is not done, or if `docs/aceite/<ticket>.md` is already committed: the plan is frozen, and only the user unfreezes it. If the file exists but is not committed, it is an earlier run that was not approved yet: review and correct it, and keep its IDs, instead of writing it again.

2. **IDs and checks.** For each acceptance criterion without an ID, add `**CA<n>**` and a check mark, without changing the criterion text. Keep existing IDs: a new criterion takes the next number, and a removed one leaves its number vacant. Running the skill again on the same ticket must change nothing already there. Review any check marks already there, since `to-tickets` may have set them before planning. Update the ticket in Linear.

3. **Acceptance file.** Create `docs/aceite/<ticket>.md` with, for each ID, the check, the scenario (Dado, Quando, Então) and, for test checks, the planned test (layer, file, name). Use the highest seam that proves the criterion and the fewest seams overall, as the `tdd` skill asks. Do not copy the criterion text.

4. **Design.** Write the contract and schema changes straight into their owners, as the root `AGENTS.md` says in "Arquivo de aceite": the routes in the OpenAPI snapshot, the implemented tables in the Prisma schema, and the conventions and what does not exist yet in the LLD. Do not create a parallel document. Every new or changed route follows `docs/lld.md`, section 3, "Formato de uma rota no snapshot", and every new or changed table follows section 2, "Formato de uma tabela no schema".

5. **Stop.** Do not commit.
   1. Write the proposed plan commit message to `docs/tickets/<ticket>/plano.msg`, a path the repository ignores. It follows the layout the root `AGENTS.md` sets in "Arquivo de aceite" (`Decision:` paragraphs, `Files and interfaces the implementation will touch:`, `Existing tests whose behavior changes:`, `Data changes:`), and it is the exact message the commit will get, so write it complete, with the attribution lines.
   2. Stage exactly the plan files with `git add`: the new acceptance file and every file the plan changed (the snapshot, the schema, the LLD, other documents), and nothing else. The page shows what is staged, which is what the plan commit will contain.
   3. Run `scripts/verify.sh plan <ticket>`. It rewrites the message as `git commit` will clean it and writes the plan review page, `docs/tickets/<ticket>/plano.html`, from the index and that message: one tab per part of the plan (what each tab shows is in `docs/harness.md`, etapa 7). If it fails, read its message and fix what it points at: a missing message, or a snapshot that is not a readable OpenAPI (fix the JSON at the point the `oasdiff` output shows). Run it again until it writes the page.
   4. Present the page to the user by whatever means you have: publish it, open it in a browser, or attach it. In the chat, show only the ticket, the path of the page and the decisions still open. Do not repeat the acceptance file, the contract or the message in the chat: they are in the page.
   5. Wait for the user's approval. Feedback comes in the chat, citing an ID or a tab; after a change, stage the changed files, write the message again if it changed and run step 3 again.

6. **Commit.** Only after the approval, check with `git status --short` that only the plan files are staged, and commit with `git commit -F docs/tickets/<ticket>/plano.msg`, so the approved message is the commit message without a copy. Then run `scripts/verify.sh plan <ticket> "$(git rev-parse --short HEAD)"`, which rebuilds `docs/tickets/<ticket>/plano.html` from the plan commit, and delete only `docs/tickets/<ticket>/plano.msg`: it is now the commit message, shown in full in the page. If that command fails, delete `plano.html` too, so no page built from the index stays behind, and tell the user how to rebuild it once the cause is fixed. The page stays in the ticket folder (why and how is in `docs/harness.md`, etapa 7, "Depois do commit de plano").

Implementation starts in a new session, from the plan commit, with the `tdd` skill.
