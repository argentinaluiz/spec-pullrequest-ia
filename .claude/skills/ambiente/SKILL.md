---
name: ambiente
description: "The development environment of this project, the Docker Compose: the rare procedures (start again from zero and recreate the database, recover an API that does not start), the Node in the container, the convergence points of the parallel fronts, the commands the sync of a front uses, the environment of a front by slot with the shortcut that calls the core of `/worktree`, and the test of the environment by slot. Use when the environment does not come up, when the database has to be recreated, or to run Node for the harness."
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

## Commands the sync uses

The environment step of the `sincronizar` mode of `/worktree` runs these in the folder of the front, whose Compose project is its own (the root `AGENTS.md`, section "Valores das skills do ticket", points here). They are written for the `compose.dev.yaml` of the folder, and `docker compose -f compose.dev.yaml` is shortened to `compose` below.

- **Update the environment.** What came from the main branch can bring new dependencies, new environment variables and new migrations: `compose exec api pnpm install` and `compose exec web pnpm install`, then `compose exec api pnpm setup:dev` (the new variables of `.env.example`, the Prisma client and the migrations).
- **Recreate the database.** After a migration was renamed or deleted: `compose down -v`, then `compose up -d --wait`. A migration that failed stays registered in the database, so deleting its folder does not clear it; the `down -v` does. If the API container already exited on a failed migration, recover it as "The API does not start" says (`compose run --rm api`).
- **Generate a migration.** When the SQL of a migration was dropped in the sync: `compose exec api pnpm exec prisma migrate dev --name <name>`.
- **Start the applications.** The containers prepare themselves and stay stopped, so after a `down -v` or an `up` the applications are not running: start them in the background with `compose exec -d api pnpm start:dev` and `compose exec -d web pnpm dev --hostname 0.0.0.0`, and wait until both answer on the ports of the `.env` of the front. The `full` verification aborts if they are down.
- **Regenerate the generated file.** The only generated file is `apps/api/openapi.json`, the snapshot of the OpenAPI description: `compose exec api pnpm openapi:generate openapi.json`, run after the applications are up and the code is merged.

## What lives here

The paths below are relative to this skill's folder, `.claude/skills/ambiente/`.

- `scripts/node-in-api.sh`: the Node command of this project. It runs Node in the `api` container, over the repository that the service mounts read-only at `/repo`, because the machine does not run `node`. Its header says how it runs, and what it does when the container is down. The plan skill, the verification and the contract skill call it.
- `pontos-de-convergencia.txt`: the files where parallel fronts usually collide, by type. It is the single owner of that classification: the core of the fronts (`/worktree`) reads it, through the shortcut below, to separate the conflicts, and the `sincronizar` mode of `/worktree` reads it to know what to resolve by rule. The rule of each type belongs to that mode.
- `scripts/frente-ambiente.sh`: the environment of a front of this project, the extension that the core of the fronts calls (`verificar <slot>`, `criar <folder> <slot>`, `derrubar <folder>`, `portas <slot>`): the `.env` of the slot with the ports and the mask of the `.git`, the check of the free ports, and the Compose of the folder. `scripts/frentes.sh` is the shortcut: it calls the core of `/worktree` with the values of this project (the limit 3, that command and the file above) and passes the subcommand.
- `scripts/test/dev-env-slot.test.sh`: the test of the environment by slot, beside the configuration it checks. `scripts/test/node-in-api.test.sh` is the test of the Node command, `scripts/test/frente-ambiente.test.sh` the test of the environment of a front, and `scripts/test/frentes-atalho.test.sh` the test of the shortcut.
