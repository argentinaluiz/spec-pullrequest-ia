---
name: verificar
description: "The verification of this project: the full verification (the verdict of the CI), the fast one, the hooks that run it, the lock of repeated failures, the semaphore, the tests of the harness and the list of protected files that the harness guard reads. Use to run or understand the verification, when the full fails or locks, or when the guard blocks or warns on a pull request."
---

The skill of this project that holds what depends on its stack in the verification. The root `AGENTS.md`, section "Definição de pronto", says **when** to run it and what the rules around it are; this skill says where each piece lives. Everything is run from the root of the repository, on the machine: the script calls the containers of the Compose.

## The entry point

`scripts/verify.sh <mode>`, in this folder. Its header is the reference of the modes (`fast`, `full`, `unlock`, `prepush`, `apps` and `plan`) and of the variables it reads. The CI runs `full`; the hooks run `fast` and `prepush`. The path in full is `.claude/skills/verificar/scripts/verify.sh`.

## The pieces

- `scripts/verify/`: the group of each app (`api.sh`, `web.sh`) and the finder of the tests of the skills (`skill-tests.sh`), which the `full` uses to find and run the tests of every skill without a list by hand.
- `scripts/full-lock.sh`: the lock of repeated failures of the full, and `scripts/full-semaphore.sh`: the wait of the full among the checkouts of the machine. `scripts/git-mount.sh`: what the container of the secret scan needs to read the history of a worktree.
- `scripts/check-report.cjs`: the check of the test reports. `scripts/test/shell-tests.sh` and `scripts/test/sh-helpers.sh`: the runner of the shell tests and its helpers, with the way to name a case that proves an acceptance criterion; `scripts/test/node-test-report.cjs`: the reporter of the Node tests.
- `hooks/`: the hook of the end of the turn (`stop-verify.sh`), the one that records the touched files (`record-touched.sh`) and the one before the command (`push-verify.sh`: the approval of the push, the unlock, the CI variables and the `full` in a subagent). They are configured in `.claude/settings.json`.
- Each piece has its tests next to it, in `scripts/test/` and `hooks/test/`.

What belongs to other skills, and the verification calls from there: the checker of the acceptance (`/plan-ticket`). The Node in the container and the commands of the contract are in the root `scripts/` folder, which no skill owns (the root `AGENTS.md` lists them). The base (`.claude/skills/worktree/scripts/harness-base.sh`) belongs to `/worktree`, and the verification loads it from there.

## The list of protected files

`arquivos-protegidos.txt`, in this folder, is the list that the guard of `/proteger-harness` reads (the format and the types are in that skill). The workflow `Guarda do harness` passes the copy from the checked-out `main`, never the one of the pull request.

The list is the only place that says which file has which type, with a comment on each group. Two rules are worth knowing before reading it: the scripts and hooks of **any** skill, and the list itself, are blocked, while the text of a skill (the `SKILL.md`, the formats, the model of the reviewer) stays free, because the root `AGENTS.md` is worth more than any skill.

When a path no pattern matches, it is code and passes. To protect a new file, add a line there; the pull request that does it is a harness change and enters by an override of the admin.
