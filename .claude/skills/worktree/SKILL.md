---
name: worktree
description: "The single entry for the parallel fronts of a project, a front being a Git worktree with its own branch, session and pull request: create one (novo), list them with the pull request and the conflicts (listar), take one down after its merge (remover), open the fronts of the tickets of a spec that are ready (abrir), and bring the base into the branch of a front (sincronizar). Use to start work on a ticket in its own checkout, to see the open fronts, to start several tickets of a spec at once, and at the end of the build of a ticket or when its pull request is out of date with the base."
---

The one place for everything about the parallel fronts. A front is a Git worktree in a folder beside the main checkout, on the branch of a ticket, with its own agent session, its own environment (when the project has one) and its own pull request. The project's agent instructions file owns the rules of a front (how many, when the main checkout counts as one, what the person does and what the agent never does); this skill reads them and never copies them. The core script of this skill owns how a front is created, listed and removed, and its refusals.

## Step 0: the project values

Read, in the project's agent instructions file, the list "Valores das skills do ticket", the entries of this skill. Read only the ones the mode you are going to run uses (the last column). Each value has a default for when the list does not give it:

| Value | Default | Used in |
| --- | --- | --- |
| Base | the main branch of the origin remote, `origin/<branch>`; the variable `HARNESS_BASE_REF` adjusts it | all modes: where a front leaves from and what the sync brings |
| Fronts command | the core script of this skill, `scripts/frentes.sh`, with its own defaults | `novo`, `listar`, `remover`, and the steps of `abrir` that list and create |
| Limit of fronts | 3 | `abrir`: how many fit |
| Convergence points file | `nenhum`, and every conflicting file is code | `sincronizar`: step 4 |
| Statuses | "In Progress", "In Review" and "Done" | `abrir`: which tickets are taken or finished |
| Kind of branch | `bugfix` for the label `Bug`, `feature` for the rest | `abrir`: the kind to pass to `novo` |
| Tickets folder | `docs/tickets` | `abrir` and `sincronizar`: where the acceptance file of a ticket lives |
| Update the environment | `nenhum` | `sincronizar`: step 5 |
| Recreate the database | `nenhum` | `sincronizar`: step 5 |
| Generate a migration | `nenhum` | `sincronizar`: step 5 |
| Start the applications | `nenhum` | `sincronizar`: step 5 |
| Regenerate each generated file | `nenhum`: a pair of the file and the command that regenerates it | `sincronizar`: steps 4 and 5 |
| Full verification | none: ask | `sincronizar`, when it runs on its own: step 8 |

Say in the chat, in one line, which values came from the default. A value that is `nenhum` skips the step that uses it. Ask the person only for a value that has no default, which is the full verification, and only when the mode needs it; once agreed, propose the entry for the list in the agent instructions file. The values mean:
- **Fronts command:** called as `<command> novo <ticket> [kind]`, `<command> listar` and `<command> remover <ticket>`. The core script takes its own options before the subcommand (`--limite`, `--ambiente` and `--pontos`) and works with Git alone when none is given. A project with an environment per front, a limit of its own or convergence points declares a shortcut that passes them, and that shortcut is the value.
- **Convergence points file:** one line per pattern, `type<TAB>path`, where the path accepts `*`; the first pattern that matches wins, and a file no pattern matches is code. The types are `gerado`, `migracoes`, `registros`, `documentos` and `manual`. The file only classifies; the rule of each type is in `modos/sincronizar.md`.
- **Update the environment, recreate the database, generate a migration, start the applications, regenerate each generated file:** the commands of the environment step of the sync. Each runs in the folder of the front.
- **Full verification:** the command that runs the complete verification of the project. If it receives the body of the pull request, save the body first and pass it as the command says.

## The modes

| Mode | When to use it | What it does |
| --- | --- | --- |
| `novo <ticket> [kind]` | The person wants to work on a ticket in its own checkout. | Calls `novo` of the fronts command. It creates the folder, the branch and, when the project has one, the environment, and prints the command that opens the session in the folder. |
| `listar` | To see the open fronts. | Calls `listar` of the fronts command: the number of each front, its branch, its pull request and with whom it conflicts. |
| `remover <ticket>` | Only when the person asks, after the merge of the pull request of the front. | Calls `remover` of the fronts command, which refuses a pull request not merged, a dirty folder and the main checkout. |
| `abrir <spec>` | The person wants to start several tickets of one spec in parallel. | Reads `modos/abrir.md` and follows it: picks the tickets that are ready, confirms the list with the person and creates one front per ticket. |
| `sincronizar` | At the end of the build of a ticket (called by `/implement`), and when the pull request of a front is out of date with the base. | Reads `modos/sincronizar.md` and follows it: brings the base into the branch of the front, resolves the conflicts by the rule of each type of convergence point and reports what came in. |

The model may call the skill, because `/implement` calls `sincronizar`. The step by step of `abrir` and `sincronizar` is in their own files, read only when the mode runs.

## What holds for every mode

- **The abandon option is the person's.** Never call `remover` with `--forcar`, which takes a front down without a merge: abandoning a ticket is the person's decision, and a hook denies it to the agent.
- **A refusal is not worked around.** When the core refuses (the limit, a ticket that already has a front, a busy place, a dirty folder), report the refusal as it is printed. Do not edit a folder, a branch or an environment file of a front by hand to make it pass.
- **Never merge a pull request.** The merge is the person's, as the project's instructions say.
- **Escalate, do not decide.** Stop and ask when a step needs a decision that is not in the ticket or in the plan and that another ticket in progress would also take, or needs to change something another ticket in progress uses.
- **The full verification runs once, in the background, and never in a subagent.** A push comes only when the person asks for it, except where the sync mode says otherwise.
- **The agent never starts a session in another folder.** Each front has its own session, opened by the person in the folder of the front; the agent says which command opens it.
