---
name: abrir-frentes
description: "Open the fronts for the tickets of a spec that are ready to start: read the sub-issues and their blocking relations in the issue tracker, pick the frontier (no pending blocker, no front or pull request yet), fit it to the free slots, confirm with the user, create one front per ticket with scripts/frentes.sh novo, and report the folder, the slot and the command that opens the session of each. Use when the user wants to start several tickets of one spec in parallel."
disable-model-invocation: true
---

How to open the parallel fronts of a spec. It prepares the places where the work will happen and stops there: each front gets its own session, and that session plans and implements its ticket. The root `AGENTS.md`, section "Frentes paralelas", owns the rules of a front; `scripts/frentes.sh` owns how one is created and its refusals. This skill reads them and never copies them.

**Input.** The identifier of the spec (the parent issue, `LUI-182`) or of a list of tickets, and optionally how many fronts to open. Without a number, open as many as the free slots allow.

**What it owns.** Choosing which tickets to open and the order. It does not own the slot, the ports, the branch name or the `.env` (that is `scripts/frentes.sh`), nor the planning and implementation of a ticket (that is `/plan-ticket` and `/implement`, run in the session of each front).

**What it never does.**
- Use `--forcar`, or call `remover`. Abandoning a front is the user's.
- Edit a `.env`, a branch or a folder of a front by hand to make a refused `novo` pass.
- Open more fronts than the free slots, or open one without the user's confirmation (step 5).
- Plan or implement a ticket, or start a session in a front. It cannot open a session in another folder, and it tells the user to.
- Change the status of an issue. "In Progress" is moved by the session of the ticket, as `/implement` says.

## Steps

1. **The tickets of the spec.** Fetch the spec and its sub-issues from the issue tracker, each one with its blocking relations ("blocked by"), its status and its type label. If the user passed tickets instead of a spec, fetch those and their blockers. The dependencies are the native relation of the tracker, not text in the description.

2. **Sort them.** Put each ticket in one group:
   - **Done:** leave out.
   - **Has a front or a pull request:** a worktree whose branch ends in the ticket, or an open pull request, as `scripts/frentes.sh listar` shows. Leave out and say where it is.
   - **Blocked:** some blocker is not "Done". Done means merged into the `main`, so a blocker with an open pull request still blocks. Leave out and say what unblocks it.
   - **Free:** no pending blocker and no front. This is the frontier.

   If the frontier is empty, say why (everything is blocked, in progress or done) and stop.

3. **How many fit.** Run `scripts/frentes.sh listar` and count the open fronts. The limit is 3 in total (`FRENTES_LIMITE` adjusts it), and the main checkout counts as one when it is on a branch that is not the `main`. The number to open is the least of: the free tickets, the free fronts, and what the user asked for. If it is zero, show the list and stop.

4. **Which ones, when there are more free tickets than fronts.** Read each free ticket and its section "Decisões de outros tickets". Prefer tickets that touch different areas, because two fronts on the same files meet in a conflict at the sync, and tickets that unblock the most others. Do not pick two tickets where one takes a decision the other also takes: the escalation rule of the root `AGENTS.md` ("Ao trabalhar em um ticket") sends that to the user, so say it. Propose the choice with the reason of each.

5. **Confirm.** Show the proposal: for each ticket, its identifier, title, type (`feature`, or `bugfix` when its label is `Bug`; `hotfix` and `docs` only if the user says) and the slot it will probably take. Say that each front starts a whole Docker environment, which takes minutes. Wait for the user to confirm or change the list. Do not start before.

6. **Create the fronts.** For each confirmed ticket, one after the other, run `scripts/frentes.sh novo <ticket> [type]` in the background (`run_in_background`), because the first start of an environment takes minutes and the commands are not allowed to wait. One after the other, not together: each start builds images and loads the machine. Wait for each to end before the next. If a `novo` refuses (limit, a ticket that already has a front, a port in use on the machine), do not work around it: report the refusal as the script prints it, skip that ticket and go on with the others. If it fails halfway, run `scripts/frentes.sh listar` and say what state the front is in; do not delete anything.

7. **Report.** When all have ended, run `scripts/frentes.sh listar` once and answer in the chat with one row per front: ticket and title, folder, slot and ports, and the command that `novo` printed to open the session. Then, for each ticket, the first thing to run in its session:
   - `/plan-ticket <ticket>` when the base has no acceptance file for it (`git show <base>:docs/tickets/<spec>/<ticket>/aceite.md` fails).
   - `/implement <ticket>` when the plan commit already exists on the branch.

   Close with what was left out and why (blocked tickets and what unblocks them, tickets already in progress, refusals), and with the reminders that matter to several fronts: one browser profile per slot, and `scripts/frentes.sh listar` shows which fronts will conflict.
