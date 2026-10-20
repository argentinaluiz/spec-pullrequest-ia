---
name: proteger-harness
description: "Protect the harness of a project from the changes of the agent and of a pull request: the guard that reads a list of protected files and fails a pull request that changes one, and the hook that denies the agent any shell command that touches the verification state folder. Use when setting up or changing what the harness protects, or when a pull request is blocked by the guard."
---

How a project protects its harness (the scripts, hooks and workflows that decide what "verified" means) from the very changes that the harness is meant to check. The skill owns the mechanism and the format of the list; the project owns **which** files are protected. It names roles and takes everything else from its caller, so it works in any repository the folder is copied to.

## The guard

`scripts/harness-guard.sh <list> [declared count] < changed paths` reads the paths a pull request changes (one per line) and classifies each by the list. It runs in a workflow that checks out the **base branch** (never the pull request), so the pull request cannot weaken the guard or the list it reads. It exits 0 when no protected file changed, 1 when one did, and 2 when it could not check: a missing, unreadable or invalid list, an empty list of paths, or as many files as the API of the host lists at most (a protected file could be missing from the list). No evidence is not approval.

**The list.** One line per pattern: the type, a tab and the path, relative to the repository root. Blank lines and lines that start with `#` are ignored. In the path, `*` matches inside one folder level and `**` crosses slashes, so a rule keeps its depth (an acceptance file at `tickets/*/*/aceite.md` is not one at `tickets/*/aceite.md`). The first pattern that matches wins; a path no pattern matches passes. The types:

- `bloqueado`: only enters by an override of the admin.
- `aviso`: warns, never blocks.
- `congelado`: warns when a file that already exists in the base changes, is renamed or deleted. A new file does not count.
- `comandos`: blocks when the `scripts` section of a package manifest changes (compared with the pull request's copy in `HEAD_DIR`, which the workflow downloads); without `HEAD_DIR`, it only warns.

The caller passes the list, so the project decides what is protected. Keep the list itself protected (`bloqueado`), or a pull request could empty it.

## The state hook

`hooks/state-guard.sh [--ajuda <text>]` is a pre-command hook for the shell tool. It denies (exit 2) any command that reads, writes or deletes in the state folder of the harness (`.harness/`), where the verification keeps its lock and its approvals: the state belongs to the verification, not to the agent. It reads the command through quotes, expansions, heredocs and interpreters (`bash -c`, `eval`); `scripts/harness-state-guard.sh` is the single definition of that reading, and `scripts/harness-dir.sh` the one of the folder path that scripts and hooks of the project use to find it (`HARNESS_DIR`). A command that only quotes the folder as text (a commit message, a search pattern) passes, and an input it cannot parse as JSON is denied if it mentions the folder.

The `--ajuda` text is added to the end of the denial message. The project says in it what only it knows, such as who unlocks the verification. Configure the hook in the project's `settings.json`, on the shell tool.

## What the project provides

- The **list** of protected files, passed to the guard by the workflow that calls it.
- The **help text** of the state hook, in the hook command of `settings.json`.
- The **workflow** that checks out the base branch, lists the changed files of the pull request (with their previous names, so that renaming a protected file counts) and calls the guard.

## Tests

The tests live next to the scripts (`scripts/test/`) and the hook (`hooks/test/`), with a small helper of their own (`scripts/test/helpers.sh`), because a generic skill does not load the project's. A case proves an acceptance criterion by carrying the token `@<ticket>-CA<n>` in its name.
