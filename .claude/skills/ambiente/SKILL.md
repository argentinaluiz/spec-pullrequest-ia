---
name: ambiente
description: "The development environment of this project, the Docker Compose: the rare procedures (start again from zero and recreate the database, recover an API that does not start), the Node in the container, the convergence points of the parallel fronts and the test of the environment by slot. Use when the environment does not come up, when the database has to be recreated, or to run Node for the harness."
---

The skill of this project that holds what is about its environment, the Docker Compose (`compose.dev.yaml`, at the root). The root `AGENTS.md`, section "Execução no Docker", keeps the rule (everything runs in the containers, and the host between services is the name of the service), the table of services and the entry commands (start, stop, the database console and the mails). The ports of each slot are in `docs/lld.md`, section 6, "Ambiente local por slot". This skill says where the rest lives and carries the procedures that are rarely needed.

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

- `scripts/node-in-api.sh`: the Node command of this project. It runs Node in the `api` container, over the repository that the service mounts read-only at `/repo`, because the machine does not run `node`. Its header says how it runs, and what it does when the container is down. The plan skill, the verification and the contract skill call it.
- `pontos-de-convergencia.txt`: the files where parallel fronts usually collide, by type. It is the single owner of that classification: `scripts/frentes.sh` reads it to separate the conflicts, and the `/sincronizar` skill reads it to know what to resolve by rule. The rule of each type belongs to `/sincronizar`.
- `scripts/test/dev-env-slot.test.sh`: the test of the environment by slot, beside the configuration it checks. `scripts/test/node-in-api.test.sh` is the test of the Node command.
