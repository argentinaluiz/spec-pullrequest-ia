---
name: contrato
description: "The contract of this project (the OpenAPI snapshot and the Prisma schema) as two commands: the readable view of the contract and the schema between two points of Git, and the drift since the plan commit. Use to read what a change does to the contract, to draw the contract of a plan, or to see the drift of a branch."
---

The skill of this project that holds how the contract and the schema are read. The contract is the OpenAPI snapshot (`apps/api/openapi.json`), which owns the routes, and the schema of Prisma (`apps/api/prisma/schema.prisma`), which owns the tables that exist. Both are commands, run from any folder (they go to the root of the repository), and both need the `docker` on the machine (the oasdiff). The view needs the `api` container up (the Node runs in it, through `scripts/node-in-api.sh` of the root), and the drift needs it only to build the view.

## The view

`scripts/contract-view.sh [<from> [<to>]]` prints, in Markdown, the readable view of the contract and the schema between two points of Git: a line with the two points, and the sections `# Contrato` (the changelog of the oasdiff, with the severity, and the full contract of each new or changed route) and `# Schema` (the diff of the schema). The points are commits (a branch and a tag too) or the id of a tree of the root, as the `git write-tree` prints for the index; without `<to>`, the second is the working folder, and without any, the first is `HEAD`. It is the contract command of the plan skill (the value is in the root `AGENTS.md`, "Valores das skills do ticket"), and the plan page reads its two sections. The renderer is `scripts/contract-view.cjs`.

## The drift

`scripts/contract-drift.sh <plan commit> <to, or empty> <drift file>` says whether the contract or the schema of `<to>` (empty: the working folder) differs from the plan commit. Without a difference, it prints one sentence that says so and does not touch the file. With one, it prints the view between the two and appends it to `<drift file>`, and emits the annotation `::warning title=Contrato diferente do planejado::...`. The contract is compared as the check of the generated snapshot does, so a snapshot regenerated that only changes descriptions, summaries, examples or the order of the keys is not a drift. If the view cannot be built, it writes the error in place of the drift and warns. It only warns: it exits 0 in all of these cases, and 2 on a wrong use.

It is the value "Desvio do contrato" of the conformance review, and what the warning of the full verification calls, so the drift has one owner.

## Shared

`scripts/contract-lib.sh` holds what the two commands share (the snapshot at a commit, the comparison of the oasdiff, the plain `git diff`, the version of the oasdiff image). The API group of the verification loads it to check the generated contract. The tests of the commands are beside them, in `scripts/test/`.
