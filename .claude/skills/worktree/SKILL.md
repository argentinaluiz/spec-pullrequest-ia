---
name: worktree
description: "The single entry for the parallel fronts of a project (a Git worktree with its own branch, session and pull request): novo, listar, remover, abrir (the fronts of the ready tickets of a spec) and sincronizar (bring the base into the branch of a front). Use to work on a ticket in its own checkout, to see the open fronts, to start several tickets of a spec at once, at the end of the build of a ticket, and when a pull request is out of date with the base."
---

A front is a Git worktree in a folder beside the main checkout, on the branch of a ticket, with its own agent session, its own environment (when the project has one) and its own pull request. The modes `novo`, `listar` and `remover` call the core script of this skill, `scripts/frentes.sh`, which the person can also run in the terminal.

The main checkout is a front too whenever it is off the main branch of the base, a detached HEAD included. At rest it stays on the main branch, brought up to date with `git merge --ff-only <base>`; to work in it, create the branch of the ticket from the base (`git switch -c <kind>/<ticket> <base>`), and it becomes the first front.

## Step 0: the project values

Read only the keys of the mode you are going to run (the last column), with `git config --file .config/project --get <key>`, `--get-all <key>` for a list of commands and `--get-regexp '^convergencia\.'` for the convergence points. If a key the mode needs is missing, ask the person and propose the line, in the syntax of `git config`. The modes `novo`, `listar` and `remover` read nothing here.

| Value | Key | Used in |
| --- | --- | --- |
| Base | none: `scripts/harness-base.sh` says where it comes from | `abrir` and `sincronizar` |
| Limit of fronts | `frentes.limite` | `abrir`: step 3 |
| Convergence points | `convergencia.<type>`, one pattern per line | `sincronizar`: step 4 |
| Statuses | `status.em-andamento`, `status.em-revisao`, `status.concluido` | `abrir`: step 2 |
| Kind of branch | `branch.tipo-do-bug`, `branch.tipo-padrao` | `abrir`: step 5 |
| Tickets folder | `tickets.pasta` | `abrir`: step 7; `sincronizar`: step 2 |
| Update the environment | `sincronizar.atualizar-ambiente` | `sincronizar`: step 5 |
| Recreate the database | `sincronizar.recriar-banco` | `sincronizar`: step 5 |
| Generate a migration | `sincronizar.gerar-migracao` | `sincronizar`: step 5 |
| Start the applications | `sincronizar.subir-aplicacoes` | `sincronizar`: step 5 |
| Regenerate each generated file | `gerado.<path>.regenerar` | `sincronizar`: steps 4 and 5 |
| Full verification | `verificacao.completa` | `sincronizar` on its own: read it before the merge |

## The modes

| Mode | When to use it | What it does |
| --- | --- | --- |
| `novo <ticket> [kind]` | The person wants to work on a ticket in its own checkout. | Calls `novo` of the core script. It creates the folder, the branch and, when the project has one, the environment, and prints the command that opens the session in the folder. |
| `listar` | To see the open fronts. | Calls `listar` of the core script: the number of each front, its branch, its pull request and with whom it conflicts. |
| `remover <ticket>` | Only when the person asks, after the merge of the pull request of the front. | Calls `remover` of the core script. |
| `abrir <spec>` | The person wants to start several tickets of one spec in parallel. | Reads `modos/abrir.md` and follows it: picks the tickets that are ready, confirms the list with the person and creates one front per ticket. |
| `sincronizar` | At the end of the build of a ticket (called by `/implement`), and when the pull request of a front is out of date with the base. | Reads `modos/sincronizar.md` and follows it: brings the base into the branch of the front, resolves the conflicts by the rule of each type of convergence point and reports what came in. |

## What holds for every mode

- **The abandon option is the person's.** Never call `remover` with `--forcar`, which takes a front down without a merge: abandoning a ticket is the person's decision, and a hook denies it to the agent.
- **A refusal is not worked around.** When the core refuses, report the refusal as it is printed. Do not edit a folder, a branch or an environment file of a front by hand to make it pass.
- **The rules of the flow are the ones of `/implement`.** Escalate a decision as its step "Escalate, do not decide" says, run the full verification as its step "Verify" says, and leave the merge to the person, as its step "Deliver, when the user asks" says. A push comes only when the person asks for it, except where the sync mode says otherwise.
- **The agent never starts a session in another folder.** Each front has its own session, opened by the person in the folder of the front; the agent says which command opens it.
