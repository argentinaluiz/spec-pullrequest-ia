# Mode `sincronizar`: bring the base into the branch of a front

How to bring the main branch of the base into the branch of a front, and tell the agent what came in, not only hand it the code. The mode runs in the session of the front, in its folder. The values are the ones read at step 0 of the skill.

**When.**
- **On its own:** the pull request of the front is out of date with the base, and the rules of the main branch do not let it merge.
- **Called by `/implement`:** at the end of the build of a ticket, after the commit of the work.

Steps 1 to 6 are the same in both; each case has its own ending.

**The base.** The base ref is the value of the base: the remote is what comes before the slash, and the main branch what comes after. Below, `<base>` is that ref.

**What it never does.** Rebase. Force a push. Change an acceptance file (the plan is frozen after the plan commit). If something in these three seems necessary, stop and ask.

**When it stops and asks.** When what entered the base contradicts a criterion of the ticket, or when resolving a conflict needs a decision that is not in the ticket or in the plan (the step "Escalate, do not decide" of `/implement`). Say what contradicts what, and wait.

## Steps

1. **Clean folder.** `git status --porcelain` must print nothing: everything is in a commit. If not, stop and ask the person to commit or discard.

2. **What entered.** `git fetch <remote> <main branch>`. The merge base is `git merge-base HEAD <base>`. If `<base>` is already an ancestor of `HEAD` (nothing entered), say so and **finish here**, giving control back when `/implement` called the mode. Otherwise list what entered since the merge base: the merged pull requests (`git log --first-parent <merge base>..<base>`, whose subjects name the pull request: `Merge pull request #N from <branch>` for a merge commit, and `... (#N)` at the end for a squash; a commit with no number, from a rebase merge, is found with `gh pr list --search <commit> --state merged`; do not filter by `--merges`, which would hide the squashed ones), and for each one read its body (`gh pr view <number> --repo <owner>/<repo> --json title,body`, the repo taken from the URL of the remote) and the acceptance file of its ticket (`git show <base>:<tickets folder>/<parent>/<ticket>/aceite.md`, the ticket taken from the branch name). `git diff --stat <merge base>...<base>` gives the files. Read all of it before resolving anything. Without `gh` (a project not on GitHub), skip the lookups that need it and say so; a commit that names no pull request has no body or acceptance file to read.

3. **Merge.** `git merge --no-ff <base>`. A merge, never a rebase, because a rebase changes the hash of the plan commit, which the plan page cites, and would need a forced push. Conflicts are expected here.

4. **Resolve by type.** List the conflicted files (`git diff --name-only --diff-filter=U`) and classify each one by the `convergencia` keys of the configuration file, whose paths are in the path pattern of `/proteger-harness` (`*` inside one folder level, `**` across them). The first pattern that matches wins; a file no pattern matches is code, and with no convergence points every file is. The rule of each type:
   - **gerado** (a file generated from the code, like the snapshot of an API description): never resolved by hand. Keep either side (`git checkout --ours`, for instance) to clear the conflict, which is only temporary, and resolve the code first. Do not regenerate it yet: generation compiles the application with the dependencies of the front, which only step 5 brings up to date. Step 5 regenerates it with the command the project declared for that file. **If the project declared no command for it, stop and ask the person how to regenerate it; do not resolve it by hand.**
   - **migracoes** (the folders or files of a migration tool that applies them by the order of their names): this rule runs even when no migration conflicts, because each front creates migrations with different names. List the ones the branch has that the base does not (`git diff --name-only --diff-filter=A <base> HEAD -- <migrations path>`, the path being the pattern the `convergencia.migracoes` key gives). Compare with `<base>`, not with the old merge base: after a merge without a textual conflict, `HEAD` is already the merge commit, and a diff from the merge base would also list the migrations the base brought, renaming a migration that was already published. Compare each one with the most recent one of the base (`git ls-tree --name-only <base> <migrations path>/`). A migration of the branch that sorts **before** the most recent one of the base is recreated, not merged: rename it with `git mv` to a name in the format of the existing ones, later than the most recent one of the base; when the names carry a date, use the current date and time in UTC, in the same format as the existing names. Step 5 recreates the database so the migrations apply in the new order. If the migration no longer fits the merged schema, delete it now, before step 5 starts the services, so the application comes up with the migrations of the base, and generate the migration again in step 5. This type is only the migrations.
   - **registros** (lists where each front adds an item and the order of the items does not change how the list is read): join the two sides, one item per line, in alphabetical order, in what is added from now on, **without reordering** what already existed. A list whose order matters, or that is grouped by topic, is not a `registros`: it is `manual`.
   - **documentos**: merge by hand, keeping both sides, and remember what was merged: the report says it.
   - **manual** (a file that is not a list to join and is not generated, like a data schema, or that is grouped by topic with comments): merge by hand, as code, keeping both sides and putting each item in the group where it belongs.
   - **code** (no type): merge by hand.

   **Check before staging.** Before `git add` on a resolved file, make sure no conflict marker is left in it (`grep -nE '^(<<<<<<<|=======|>>>>>>>)'` prints nothing). **Mark the logic:** a resolution that is not purely mechanical (code, a `manual` file, a document that changes a rule) counts as having touched logic; the ending on its own uses it.

5. **Update the environment of the front, then regenerate.** Run the commands in the folder of the front: its environment is its own. The order is part of this mode; the commands are values of the project, a repeated key is a list of commands run in sequence, and a command that is absent skips its item.
   1. **Recreate the database,** if step 4 renamed or deleted a migration. A migration that failed stays registered in the database, so deleting it does not clear it; recreating the database does. If the application already exited on a failed migration, recover it as the project's environment instructions say.
   2. **Update the environment.** What came from the base can bring new dependencies, new environment variables and new migrations. If the migration dropped in step 4 was deleted, **generate the migration** again now, with the project's command.
   3. **Start the applications,** if they are not running, and wait until they answer on the ports of the front. The full verification aborts if they are down.
   4. **Regenerate each generated file** that was in conflict, from the merged code, with the command the project declared for that file, and stage it. The verification of the project checks the result.

6. **Adapt.** Compare what entered (step 2) with what the ticket changes. Adapt what depends on what changed, even without a textual conflict: a renamed function, a contract field, a rule of the architecture document. Run the tests of what crosses, with the commands the project gives for each part, only the ones tied to the files involved. An adaptation of code counts as having touched logic.

## Ending, called by `/implement`

7. **Commit** the merge with everything staged in steps 4 to 6, the regenerated files included (the merge commit message says which base it brings, in one line). If step 3 merged without conflicts, the merge commit already exists: commit what steps 5 and 6 changed in a new commit on top of it.
8. **Report** in the chat and give control back to `/implement`, without the full verification or a push: they are the ones of `/implement`.

## Ending, on its own

7. **Code review, only if needed.** If the resolution or the adaptation touched logic (steps 4 and 6), run `/code-review` on the merge; if everything was mechanical, skip it.
8. **Commit** the merge as in the other ending.
9. **Verify and push.** Run the full verification as the step "Verify" of `/implement` says. When it passes, push with a plain `git push` of the branch (never forced).
10. **Report** in the chat and in a comment of the pull request (`gh pr comment`).

## The report

What entered (the pull requests, the tickets and the criteria that matter to this one); the conflicts, file by file with their type; how each was resolved, and which documents were merged by hand; what was adapted; and, on its own, whether the code review ran and the result of the full verification.
