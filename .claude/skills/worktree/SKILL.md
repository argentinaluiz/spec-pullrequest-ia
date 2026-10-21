---
name: worktree
description: "The single entry for the parallel fronts of a project (a Git worktree with its own branch, session and pull request): novo, listar, remover, abrir (the fronts of the ready tickets of a spec) and sincronizar (bring the base into the branch of a front). Use to work on a ticket in its own checkout, to see the open fronts, to start several tickets of a spec at once, at the end of the build of a ticket, and when a pull request is out of date with the base."
---

The one place for everything about the parallel fronts. A front is a Git worktree in a folder beside the main checkout, on the branch of a ticket, with its own agent session, its own environment (when the project has one) and its own pull request. The project's agent instructions file owns the rules of a front (how many, when the main checkout counts as one, what the person does and what the agent never does); this skill reads them and never copies them. The core script of this skill owns how a front is created, listed and removed, and its refusals.

## Step 0: the project values

The values of the project live in its configuration file, `.config/project`, in the syntax of `git config` (one file for the project, with a section for each subject, and each skill reads the sections it uses). Read only the keys the mode you are going to run uses (the last column), with `git config --file .config/project --get <key>`, `--get-all <key>` for a list of commands and `--get-regexp '^convergencia\.'` for the convergence points. Each value has a default for when the file does not give it, and a project with no file (or no such key) runs every value on its default:

| Value | Key | Default | Used in |
| --- | --- | --- | --- |
| Base | none: the variable `HARNESS_BASE_REF` adjusts it | the main branch of the origin remote, `origin/<branch>` | `abrir` and `sincronizar`: what a front leaves from and what the sync brings (the core reads it by itself in the other modes) |
| Limit of fronts | `frentes.limite` | 3 | the core, in `novo`; `abrir`: step 3, how many fit |
| Environment command | `frentes.ambiente` | none: the core works with Git alone | the core, in `novo`, `listar` and `remover` |
| Convergence points | `convergencia.<type>`, one pattern per line | none, and every conflicting file is code | the core, in `listar`; `sincronizar`: step 4 |
| Statuses | `status.em-andamento`, `status.em-revisao`, `status.concluido` | "In Progress", "In Review" and "Done" | `abrir`: steps 2 and 3, which tickets are taken or finished |
| Kind of branch | `branch.tipo-do-bug`, `branch.tipo-padrao` | `bugfix` for the label `Bug`, `feature` for the rest | `abrir`: step 5, the kind to pass to `novo` |
| Tickets folder | `tickets.pasta` | `docs/tickets` | `abrir` (step 7) and `sincronizar` (step 2): where the acceptance file of a ticket lives |
| Update the environment | `sincronizar.atualizar-ambiente` | none | `sincronizar`: step 5 |
| Recreate the database | `sincronizar.recriar-banco` | none | `sincronizar`: step 5 |
| Generate a migration | `sincronizar.gerar-migracao` | none | `sincronizar`: step 5 |
| Start the applications | `sincronizar.subir-aplicacoes` | none | `sincronizar`: step 5 |
| Regenerate each generated file | `gerado.<path>.regenerar` | none: a generated file in conflict with no command makes the agent ask | `sincronizar`: steps 4 and 5 |
| Full verification | `verificacao.completa` | none: ask | `sincronizar`, when it runs on its own: ask now, before the merge, because step 8 runs it |

Say in the chat, in one line, which of the values the mode reads came from the default, all of them when the project has no file. The modes `novo`, `listar` and `remover`, which only call the core (it reads the file by itself), say it only when the project has no file. A value whose default is "none" skips the step that uses it while its key is absent. Ask the person only for a value that has no default, which is the full verification, and only when the mode needs it; once agreed, propose the line for the file. The values mean:
- **Limit of fronts:** the most fronts at once, counting the main checkout when it is a front.
- **Environment command:** a path, relative to the root of the checkout. The core calls it with `verificar`, `criar`, `derrubar` and `portas`, and the header of the core script (`scripts/frentes.sh`) has the contract.
- **Convergence points:** a line per pattern, `<type> = <path>`; the first pattern that matches wins, and a file no pattern matches is code. The types are `gerado`, `migracoes`, `registros`, `documentos` and `manual`. The header of the core script has the syntax, and the rule of each type is in `modos/sincronizar.md`.
- **Update the environment, recreate the database, generate a migration, start the applications, regenerate each generated file:** the commands of the environment step of the sync, run in the order of the file (a repeated key is a list of commands in sequence). Each runs in the folder of the front.
- **Full verification:** the command that runs the complete verification of the project. If it receives the body of the pull request, it shows where with a placeholder (`<file>`): save the body first and pass it there.

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
- **Never merge a pull request.** The merge is the person's, as the project's instructions say.
- **Escalate, do not decide.** Stop and ask when a step needs a decision that is not in the ticket or in the plan and that another ticket in progress would also take, or needs to change something another ticket in progress uses.
- **The full verification runs once, in the background, and never in a subagent.** A push comes only when the person asks for it, except where the sync mode says otherwise.
- **The agent never starts a session in another folder.** Each front has its own session, opened by the person in the folder of the front; the agent says which command opens it.
