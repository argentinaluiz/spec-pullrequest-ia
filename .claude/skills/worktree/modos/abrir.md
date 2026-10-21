# Mode `abrir`: open the fronts of a spec

How to open the parallel fronts of a spec. The mode prepares the places where the work will happen and stops there: each front gets its own session, and that session plans and implements its ticket. The values are the ones read at step 0 of the skill.

**Input.** The identifier of the spec (the parent issue, `PROJ-1`) or of a list of tickets, and optionally how many fronts to open. Without a number, open as many as the free vagas allow. A *vaga* is one of the places for a front, counted by the limit.

**What it owns.** Choosing which tickets to open and the order. It does not own the number of a front, the name of a branch or the environment (the core script owns them), nor the planning and implementation of a ticket (that is the plan skill and `/implement`, run in the session of each front). The rules in the last section of `SKILL.md` ("What holds for every mode") apply here too.

**What it never does.**
- Open more fronts than the free vagas, or open one without the person's confirmation (step 5): no front is created before the person answers the proposal, also when the model called the skill.
- Plan or implement a ticket.
- Change the status of an issue. The in-progress status is moved by the session of the ticket: the plan skill does it when planning starts, and `/implement` checks it.

## Steps

1. **The tickets of the spec.** Fetch the spec and its sub-issues from the issue tracker, each one with its description, its blocking relations ("blocked by"), its status and its type label. Run `listar` of the core script of the skill (`scripts/frentes.sh`, from the folder of the skill) and `git fetch` once, now: the steps below reuse them. If the person passed tickets instead of a spec, fetch those and their blockers. The dependencies are the native relation of the tracker, not text in the description.

2. **Sort them.** Put each ticket in one group:
   - **Done:** leave out.
   - **Already taken:** the ticket has a worktree whose branch ends in it (from the `listar` of step 1), a pull request (open or merged), a local or remote branch (`git branch -a --list '*<ticket in lowercase>*'`, after the fetch of step 1, as the branch naming of the project puts the ticket in the name), or the in-progress or in-review status (the statuses of step 0) in the tracker. Leave out and say where the work is. The `novo` only looks at worktrees: given a ticket that has a branch but no worktree, it would create a second branch for the same ticket, apart from the work already done. How to resume that work is the person's decision. Before calling the work open, check whether it is already in the base: the branch is an ancestor of the base (`git merge-base --is-ancestor <branch> <base>`), or `git cherry <base> <branch>` prints no `+` line, or its pull request is merged. The `git cherry` prints one line per commit of the branch: `+` when the base has no equivalent of it, which is work still pending, and `-` when the base has one, which is work already in the base. A `-` line is not pending work, even though the commit has another hash there. If nothing is pending, the ticket goes to the next group.
   - **Stale status:** the tracker says in progress or in review but the work is already in the base. There is nothing to open and nothing to resume. Leave out and tell the person which tickets to close in the tracker, because changing the status is not this mode's job.
   - **No code to build:** a ticket that changes nothing in the repository, like a design in a design tool, has no pull request and needs no front. Leave out and say so.
   - **Blocked:** some blocker is not finished. Finished means merged into the main branch, so a blocker with an open pull request still blocks. Leave out and say what unblocks it.
   - **Free:** no pending blocker and not taken. This is the frontier.

   If the frontier is empty, say why (everything is blocked, in progress or done) and stop.

3. **How many fit.** Count the open fronts in the `listar` of step 1. The limit is the one of the values, and the main checkout counts as one when it is off the main branch of the base, a detached HEAD included (the core counts it so): if it does, say that it takes a vaga and how to free it. An old worktree counts too, with or without a pull request: name the ones that look abandoned and leave them to the person, because removing a front without a merge is the person's. The number to open is the least of: the free tickets, the free fronts, and what the person asked for. If it is zero, show the list and stop.

4. **Overlap, and which ones when there are more free tickets than fronts.** Read, in the data of step 1, where each free ticket lists the decisions it takes from other tickets, and compare it with the tickets already taken in step 2 whose work is still pending, which keep running while the new fronts work. A ticket with a stale status does not overlap with anything: its work is already in the base the new front starts from. Prefer tickets that touch different areas, because two fronts on the same files meet in a conflict at the sync, and tickets that unblock the most others. Warn when a free ticket overlaps one already taken. Do not pick two tickets where one takes a decision the other also takes: the escalation rule (step 4 of `/implement`) sends that to the person, so say it. Propose the choice with the reason of each.

5. **Confirm.** Show the proposal: for each ticket, its identifier, title, kind of branch (the value of the kind of branch; `hotfix` and `docs` only if the person says) and the vaga it will probably take. Say that each front may start a whole environment, which takes minutes. **Stop and wait** for the person to confirm or change the list. Do not run `novo` for any ticket before the answer.

6. **Create the fronts.** For each confirmed ticket, one after the other, run `novo <ticket> [kind]` of the core script in the background (`run_in_background`), because the first start of an environment takes minutes and the commands are not allowed to wait. One after the other, not together: each start builds images and loads the machine. Wait for each to end before the next. If a `novo` refuses (limit, a ticket that already has a front, a busy vaga), do not work around it: report the refusal as the script prints it, skip that ticket and go on with the others. If it fails halfway, run `listar` and say what state the front is in; do not delete anything.

7. **Report.** When all have ended, run `listar` once and answer in the chat with one row per front: ticket and title, folder, number of the front and ports, and the command that `novo` printed to open the session. Then, for each ticket, the first thing to run in its session:
   - the plan skill on the ticket, when the base has no acceptance file for it (`git ls-tree -r --name-only <base> <tickets folder>/<spec>` does not list `<ticket>/aceite.md`). A new front starts from the base, so this is the usual case.
   - `/implement <ticket>`, when the base already has the acceptance file, which means the plan is merged. In both cases, the implementation of a planned ticket starts in a new session of the same front.

   Close with what was left out and why (blocked tickets and what unblocks them, tickets already in progress, refusals), and with the reminder that `listar` shows which fronts will conflict.
