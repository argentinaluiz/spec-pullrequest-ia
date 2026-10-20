---
name: verificar
description: "The verification of this project: the list of protected files that the harness guard reads. Use when a change touches the harness, or when the guard blocks or warns on a pull request."
---

The skill of this project that holds what depends on its stack in the verification. For now it holds only the list of protected files; the rest of the verification arrives with the next tickets of the spec on reusable skills.

## The list of protected files

`arquivos-protegidos.txt`, in this folder, is the list that the guard of `/proteger-harness` reads (the format and the types are in that skill). The workflow `Guarda do harness` passes the copy from the checked-out `main`, never the one of the pull request.

- **Blocked:** what decides the verdict or what the agent can do: the workflow, the settings, the hooks, the installed agents, `scripts/`, the scripts and hooks of **any** skill, and the list itself. The text of a skill (the `SKILL.md`, the formats, the model of the reviewer) stays free, because the root `AGENTS.md` is worth more than any skill.
- **Warning:** what defines what the verification runs, the test map of each ticket and the convergence points, which change in normal work and ask only for a reading before the merge.
- **Frozen:** an acceptance file that already exists.
- **Commands:** the `scripts` section of the package manifests of the apps.

When a path no pattern matches, it is code and passes. To protect a new file, add a line here; the pull request that does it is a harness change and enters by an override of the admin.
