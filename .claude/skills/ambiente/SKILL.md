---
name: ambiente
description: "The development environment of this project, the Docker Compose: the rare procedures (start again from zero and recreate the database, recover an API that does not start), the Node in the container and the environment of a front by slot. Use when the environment does not come up, when the database has to be recreated, or to run Node for the harness."
---

The skill of this project that holds what is about its environment, the Docker Compose (`compose.dev.yaml`, at the root). The root `AGENTS.md`, section "Execução no Docker", owns the rule, the table of services and the entry commands; the ports of each slot are in `docs/lld.md`, section 6, "Ambiente local por slot". This skill carries the procedures that are rarely needed and says where the rest of the environment lives.

## Rare procedures

**Start again from zero.** To drop the data and recreate the database:

```bash
docker compose -f compose.dev.yaml down -v
```

The `-v` deletes the volume of the database. On the next start, the database is recreated and the migrations are applied again. To also generate a new `.env` and new keys, delete `apps/api/.env` before starting. Then start the environment as the `AGENTS.md` says.

**The API does not start.** If `up --wait` ends with an error, see the cause with:

```bash
docker compose -f compose.dev.yaml logs api
```

When the preparation of the API fails (a broken migration, an incomplete `.env`), the `api` container exits and `exec` stops working in it. To fix it, run the command in a standalone container, which does not go through the preparation:

```bash
docker compose -f compose.dev.yaml run --rm api <command>
```

After the fix, start the environment again.

## What lives here

The paths below are relative to this skill's folder, `.claude/skills/ambiente/`.

- `scripts/node-in-api.sh`: the Node command of this project. It runs Node in the `api` container, over the repository that the service mounts read-only at `/repo`, because the machine does not run `node`. Its header says how it runs, and what it does when the container is down.
- `scripts/frente-ambiente.sh`: the environment of a front of this project: the `.env` of the slot with the ports and the mask of the `.git`, the check of the free ports, and the Compose of the folder. It is the command that `.config/worktree` names for the core of `/worktree`, and its header says the contract (`verificar <slot>`, `criar <folder> <slot>`, `derrubar <folder>`, `portas <slot>`).
- `scripts/test/`: the tests of the files above and of the environment by slot (`dev-env-slot.test.sh`), beside what they check, and the test of the fronts of the project (`frentes-do-projeto.test.sh`), which runs the core of `/worktree` with the configuration of the project.
