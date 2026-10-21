---
name: verificar
description: "The verification of this project: the full verification (the verdict of the CI), the fast one, the hooks that run it, the lock of repeated failures, the semaphore, the tests of the harness and the list of protected files that the harness guard reads. Use to run or understand the verification, when the full fails or locks, or when the guard blocks or warns on a pull request."
---

Where each piece of the verification of this project lives. When to run it, and the rules around it, are in the root `AGENTS.md`, section "Definição de pronto". Everything is run from the root of the repository, on the machine: the script calls the containers of the Compose.

## The entry point

`.claude/skills/verificar/scripts/verify.sh <mode>`. Its header is the reference of the modes and of the variables it reads. The CI runs `full`; the hooks run `fast` and `prepush`.

## The pieces

In this folder:

- `scripts/verify/`: the group of each app (`api.sh`, `web.sh`) and the finder of the tests of the skills (`skill-tests.sh`).
- `scripts/full-lock.sh`: the lock of repeated failures of the full. `scripts/full-semaphore.sh`: the wait of the full among the checkouts of the machine. `scripts/git-mount.sh`: what the container of the secret scan needs to read the history of a worktree.
- `scripts/check-report.cjs`: the check of the test reports. `scripts/test/shell-tests.sh`: the runner of the shell tests. `scripts/test/node-test-report.cjs`: the reporter of the Node tests.
- `hooks/`: the hook of the end of the turn (`stop-verify.sh`), the one that records the touched files (`record-touched.sh`) and the one before the command (`push-verify.sh`), configured in `.claude/settings.json`.
- The tests of each piece, in `scripts/test/` and `hooks/test/`.

In other skills: the acceptance checker and the plan commit (`plan-git.sh`) (`/plan-ticket`); the base and the lock folder of the machine (`harness-base.sh`, `/worktree`); the state folder (`harness-dir.sh`, `/proteger-harness`). The tests of the kit skills and the helpers of the shell tests are in `.claude/skills/__tests__/`.

In the root `scripts/` folder: the Node in the container, the commands of the contract and the list the guard reads (`protected-list.sh`).

## The list of protected files

The guard reads the list of `protegidos.lista` in `.config/project` (`.config/arquivos-protegidos`), plus what `scripts/protected-list.sh` appends (its header says what). Who may change it is in the root `AGENTS.md`, section "Convenções de Git", "Arquivos do harness".
