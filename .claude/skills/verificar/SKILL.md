---
name: verificar
description: "The verification of this project: the full verification (the verdict of the CI), the fast one, the hooks that run it, the lock of repeated failures, the semaphore, the tests of the harness and the list of protected files that the harness guard reads. Use to run or understand the verification, when the full fails or locks, or when the guard blocks or warns on a pull request."
---

The skill of this project that holds what depends on its stack in the verification. The root `AGENTS.md`, section "Definição de pronto", says **when** to run it and what the rules around it are; this skill says where each piece lives. Everything is run from the root of the repository, on the machine: the script calls the containers of the Compose.

## The entry point

`scripts/verify.sh <mode>`, in this folder. Its header is the reference of the modes (`fast`, `full`, `unlock`, `prepush` and `apps`) and of the variables it reads. The CI runs `full`; the hooks run `fast` and `prepush`. The path in full is `.claude/skills/verificar/scripts/verify.sh`.

## The pieces

- `scripts/verify/`: the group of each app (`api.sh`, `web.sh`) and the finder of the tests of the skills (`skill-tests.sh`), which the `full` uses to find and run the tests of every skill without a list by hand.
- `scripts/full-lock.sh`: the lock of repeated failures of the full, and `scripts/full-semaphore.sh`: the wait of the full among the checkouts of the machine. `scripts/git-mount.sh`: what the container of the secret scan needs to read the history of a worktree.
- `scripts/check-report.cjs`: the check of the test reports. `scripts/test/shell-tests.sh`: the runner of the shell tests (the suites load the helpers of the plan skill, whose header says how to name a case that proves an acceptance criterion); `scripts/test/node-test-report.cjs`: the reporter of the Node tests.
- `hooks/`: the hook of the end of the turn (`stop-verify.sh`), the one that records the touched files (`record-touched.sh`) and the one before the command (`push-verify.sh`: the approval of the push, the unlock, the CI variables and the `full` in a subagent). They are configured in `.claude/settings.json`.
- Each piece has its tests next to it, in `scripts/test/` and `hooks/test/`.

What belongs to other skills, and the verification loads from there: the checker of the acceptance, the commit of the plan (`plan-git.sh`) and the helpers of the shell tests (`/plan-ticket`); the base and the lock folder of the machine (`harness-base.sh`, `/worktree`); and the state folder (`harness-dir.sh`, `/proteger-harness`). The Node in the container, the commands of the contract and the list the guard reads (`protected-list.sh`) are in the root `scripts/` folder, which no skill owns. The values of the project come from `.config/project`.

## The list of protected files

`.config/arquivos-protegidos`, at the root of the repository (the key `protegidos.lista` of `.config/project`), is the list of protected files (the format and the types are in `/proteger-harness`). The workflow `Guarda do harness` passes to the guard the copy from the checked-out `main`, never the one of the pull request, followed by what `.config/project` owns: the acceptance files of the tickets folder as `congelado`, and the test maps and the convergence points as `aviso`. `scripts/protected-list.sh` joins them.

The list is the only place that says which file has which type, with a comment on each group, besides the tickets folder and the convergence points, which `.config/project` owns. Two rules are worth knowing before reading it: the scripts and hooks of **any** skill, and everything under `.config/` (the list among it), are blocked, while the text of a skill (the `SKILL.md`, the formats, the model of the reviewer) stays free, because the root `AGENTS.md` is worth more than any skill.

When a path no pattern matches, it is code and passes. To protect a new file, add a line there; the pull request that does it is a harness change and enters by an override of the admin.
