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

4. **Design.** Write the contract and schema changes straight into their owners, as the root `AGENTS.md` says in "Arquivo de aceite": the routes in the OpenAPI snapshot, the implemented tables in the Prisma schema, and the conventions and what does not exist yet in the LLD. Do not create a parallel document.

5. **Stop.** Do not commit. Show the diff summary and the proposed commit message, whose body lists the files and interfaces the implementation will touch, including the existing tests whose behavior the ticket changes (it goes only in the commit, because it ages fast). Wait for the user's approval; only then commit the plan.

Implementation starts in a new session, from the plan commit, with the `tdd` skill.
