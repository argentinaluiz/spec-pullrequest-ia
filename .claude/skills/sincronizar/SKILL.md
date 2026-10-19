---
name: sincronizar
description: "Bring the main of the base remote into the branch of a front: list what entered, merge it without rebase or forced push, resolve the conflicts by the rule of each type of convergence point, update the environment, adapt the ticket, verify with the full, push and report in the chat and in a PR comment. Use in the session of a front when its pull request is out of date with main, and at the end of the ticket, before the full."
---

How to bring the `main` into the branch of a front, and tell the agent what came in, not only hand it the code. The skill runs in the session of the front, in its folder. The root `AGENTS.md`, section "Frentes paralelas", says when to use it.

**When.** (1) When the pull request of the front is out of date with the `main`: the ruleset of the `main` does not let it merge. (2) At the end of the ticket, before the `full`, so that the single complete verification of the task runs against the current `main`.

**What it owns.** The steps below and the resolution rule of each type of convergence point. It does not own which files are of each type: that is `scripts/pontos-de-convergencia.txt`, which it reads and never copies. It does not own the full semaphore or the check of the migration order either: it calls `scripts/verify.sh`, which owns them.

**The base.** The base ref is `HARNESS_BASE_REF`, as in `scripts/verify.sh` (`origin/main` by default): the remote is what comes before the slash, and the main branch what comes after. Below, `<base>` is that ref.

**What it never does.** Rebase. Force a push. Merge a pull request. Change an acceptance file (the plan is frozen after the plan commit). If something in these four seems necessary, stop and ask.

**When it stops and asks.** When what entered the `main` contradicts a criterion of the ticket, or when resolving a conflict needs a decision that is not in the ticket or in the plan (the escalation rule of the root `AGENTS.md`). Say what contradicts what, and wait.

## Steps

1. **Clean folder.** `git status --porcelain` must print nothing: everything is in a commit. If not, stop and ask the person to commit or discard.

2. **What entered.** `git fetch <remote> <main branch>`. The merge base is `git merge-base HEAD <base>`. If `<base>` is already an ancestor of `HEAD` (nothing entered), say so and **finish here**. Otherwise list what entered since the merge base: the merged pull requests (`git log --merges --first-parent <merge base>..<base>`, whose subjects name the pull request and the branch), and for each one read its body (`gh pr view <number> --repo <owner>/<repo> --json title,body`, the repo taken from the URL of the remote) and the acceptance file of its ticket (`git show <base>:docs/tickets/<parent>/<ticket>/aceite.md`, the ticket taken from the branch name). `git diff --stat <merge base>...<base>` gives the files. Read all of it before resolving anything.

3. **Merge.** `git merge --no-ff <base>`. A merge, never a rebase, because a rebase changes the hash of the plan commit, which the plan page cites, and would need a forced push. Conflicts are expected here.

4. **Resolve by type.** List the conflicted files (`git diff --name-only --diff-filter=U`) and classify each one by `scripts/pontos-de-convergencia.txt` (the first pattern that matches; a file no pattern matches is code). The rule of each type:
   - **gerado** (the OpenAPI snapshot): never resolved by hand. Keep either side to clear the conflict, resolve the code first, and then regenerate it from the merged code with `docker compose -f compose.dev.yaml exec api pnpm openapi:generate openapi.json`. The verification that already exists checks the result.
   - **migracoes**: a migration folder of the branch that sorts **before** the most recent one of the `main` is recreated, not merged: rename the folder with `git mv` to a name with the current date (UTC, `AAAAMMDDHHMMSS_<name>`), later than the most recent one of the `main`, and start the local database again (`docker compose -f compose.dev.yaml down -v`, then `up -d --wait`) so the migrations apply in the new order; if the SQL no longer fits the merged schema, delete the folder and generate it again with `pnpm exec prisma migrate dev --name <name>` on the restarted database. The `schema.prisma` itself is merged by hand, like code, because it is not a list.
   - **registros** (lists where each front adds an item): join the two sides, one item per line, in alphabetical order, in what is added from now on, **without reordering** what already existed.
   - **documentos**: merge by hand, keeping both sides, and remember what was merged: the report of step 9 says it.
   - **code** (no type): merge by hand.

   **Check before staging.** Before `git add` on a resolved file, make sure no conflict marker is left in it (`grep -nE '^(<<<<<<<|=======|>>>>>>>)'` prints nothing). **Mark the logic:** a resolution that is not purely mechanical (code, a hand-merged schema, a document that changes a rule) counts as having touched logic; steps 6 and 7 use it.

5. **Update the environment of the front.** What came from the `main` can bring new dependencies, new environment variables and new migrations: `docker compose -f compose.dev.yaml exec api pnpm install` and `exec web pnpm install`, then `exec api pnpm setup:dev` (new variables of the `.env.example`, the Prisma client and the migrations). Run the commands in the folder of the front: its Compose project is its own.

6. **Adapt.** Compare what entered (step 2) with what the ticket changes. Adapt what depends on what changed, even without a textual conflict: a renamed function, a contract field, a rule of the LLD. Run the tests of what crosses, with the commands of the `AGENTS.md` of each project, only the ones tied to the files involved.

7. **Code review, only if needed.** If the resolution or the adaptation touched logic (step 4), run `/code-review` on the merge. If everything was mechanical, skip it.

8. **Commit, verify, push.** Commit the merge (the merge commit message says which `main` it brings, in one line). Run `scripts/verify.sh full` in the background, as the root `AGENTS.md` says; it waits its turn if another `full` runs on the machine, and the wait is not a failure. When it passes, push with a plain `git push` of the branch (never forced). If the `full` fails, fix the cause and run it again, as in any task.

9. **Report.** In the chat and in a comment of the pull request (`gh pr comment`), say: what entered (the pull requests, the tickets and the criteria that matter to this one); the conflicts, file by file with their type; how each was resolved, and which documents were merged by hand; what was adapted; whether the code review ran; and the result of the `full`. If the pull request does not exist yet, report in the chat and put the same text in its description when it is opened.
