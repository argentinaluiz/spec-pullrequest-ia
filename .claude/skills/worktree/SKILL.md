---
name: worktree
description: "The single entry for the parallel fronts of a project (a Git worktree with its own branch, session and pull request): novo, listar, remover, abrir (the fronts of the ready tickets of a spec) and sincronizar (bring the base into the branch of a front). Use to work on a ticket in its own checkout, to see the open fronts, to start several tickets of a spec at once, at the end of the build of a ticket, and when a pull request is out of date with the base."
---

The one place for everything about the parallel fronts. A front is a Git worktree in a folder beside the main checkout, on the branch of a ticket, with its own agent session, its own environment (when the project has one) and its own pull request. The core script of this skill owns how a front is created, listed and removed, and its refusals; the person can also run it in the terminal (`scripts/frentes.sh novo|listar|remover`).

The main checkout is a front too whenever it is off the main branch of the base, a detached HEAD included. At rest it stays on the main branch, brought up to date with `git merge --ff-only <base>`; to work in it, create the branch of the ticket from the base (`git switch -c <kind>/<ticket> <base>`), and it becomes the first front.

## Step 0: the project values

Read only the keys the mode you are going to run uses (the last column), from the project's configuration file: `git config --file .config/project --get <key>`, `--get-all <key>` for a list of commands and `--get-regexp '^convergencia\.'` for the convergence points. If a key the mode needs is missing, ask the person and propose the line for the file, in the syntax of `git config`. The modes `novo`, `listar` and `remover` only call the core script (`scripts/frentes.sh`), which reads its own keys; its header says which.

| Value | Key | Used in |
| --- | --- | --- |
| Base | none: the variable `HARNESS_BASE_REF`, or the main branch the origin remote names (`scripts/harness-base.sh`) | `abrir` and `sincronizar`: what a front leaves from and what the sync brings |
| Limit of fronts | `frentes.limite` | `abrir`: step 3, how many fit |
| Convergence points | `convergencia.<type>`, one pattern per line | `sincronizar`: step 4 |
| Statuses | `status.em-andamento`, `status.em-revisao`, `status.concluido` | `abrir`: steps 2 and 3, which tickets are taken or finished |
| Kind of branch | `branch.tipo-do-bug`, `branch.tipo-padrao` | `abrir`: step 5, the kind to pass to `novo` |
| Tickets folder | `tickets.pasta` | `abrir` (step 7) and `sincronizar` (step 2): where the acceptance file of a ticket lives |
| Update the environment | `sincronizar.atualizar-ambiente` | `sincronizar`: step 5 |
| Recreate the database | `sincronizar.recriar-banco` | `sincronizar`: step 5 |
| Generate a migration | `sincronizar.gerar-migracao` | `sincronizar`: step 5 |
| Start the applications | `sincronizar.subir-aplicacoes` | `sincronizar`: step 5 |
| Regenerate each generated file | `gerado.<path>.regenerar` | `sincronizar`: steps 4 and 5 |
| Full verification | `verificacao.completa` | `sincronizar`, when it runs on its own: read it now, before the merge, because step 8 runs it |

A project without an environment for its fronts has no environment commands, and the steps that use them are skipped; a generated file in conflict with no command to regenerate it makes the agent ask. The values mean:
- **Limit of fronts:** the most fronts at once, counting the main checkout when it is a front.
- **Convergence points:** a line per pattern, `<type> = <path>`, in the path pattern of the core (`*` stays inside one folder level and `**` crosses the slashes); the first pattern that matches wins, and a file no pattern matches is code. The types are `gerado`, `migracoes`, `registros`, `documentos` and `manual`, and the rule of each type is in `modos/sincronizar.md`.
- **Update the environment, recreate the database, generate a migration, start the applications, regenerate each generated file:** the commands of the environment step of the sync, run in the order of the file (a repeated key is a list of commands in sequence). Each runs in the folder of the front.
- **Full verification:** the command that runs the complete verification of the project. If it receives the body of the pull request, it shows where with a placeholder (`<arquivo>`): save the body first and pass it there.

## The modes

| Mode | When to use it | What it does |
| --- | --- | --- |
| `novo <ticket> [kind]` | The person wants to work on a ticket in its own checkout. | Calls `novo` of the core script of this skill (`scripts/frentes.sh`). It creates the folder, the branch and, when the project has one, the environment, and prints the command that opens the session in the folder. |
| `listar` | To see the open fronts. | Calls `listar` of the core script: the number of each front, its branch, its pull request and with whom it conflicts. |
| `remover <ticket>` | Only when the person asks, after the merge of the pull request of the front. | Calls `remover` of the core script, which refuses a pull request not merged, a dirty folder and the main checkout. |
| `abrir <spec>` | The person wants to start several tickets of one spec in parallel. | Reads `modos/abrir.md` and follows it: picks the tickets that are ready, confirms the list with the person and creates one front per ticket. |
| `sincronizar` | At the end of the build of a ticket (called by `/implement`), and when the pull request of a front is out of date with the base. | Reads `modos/sincronizar.md` and follows it: brings the base into the branch of the front, resolves the conflicts by the rule of each type of convergence point and reports what came in. |

The model may call the skill, because `/implement` calls `sincronizar`; `abrir` still waits for the person's confirmation before it creates any front. The step by step of `abrir` and `sincronizar` is in their own files, read only when the mode runs.

## What holds for every mode

- **The abandon option is the person's.** Never call `remover` with `--forcar`, which takes a front down without a merge: abandoning a ticket is the person's decision, and a hook denies it to the agent.
- **A refusal is not worked around.** When the core refuses (the limit, a ticket that already has a front, a busy place, a dirty folder), report the refusal as it is printed. Do not edit a folder, a branch or an environment file of a front by hand to make it pass.
- **The rules of the flow are the ones of `/implement`.** Escalate a decision as its step 4 says, run the full verification as its step 8 says, and never merge, as its step 9 says. A push comes only when the person asks for it, except where the sync mode says otherwise.
- **The agent never starts a session in another folder.** Each front has its own session, opened by the person in the folder of the front; the agent says which command opens it.
