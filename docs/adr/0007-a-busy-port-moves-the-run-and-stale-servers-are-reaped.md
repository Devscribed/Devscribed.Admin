# 0007 — A busy port moves the run, and stale servers are reaped

**2026-09-01.** Accepted. Amends [0005](0005-e2e-runs-beside-a-dev-environment.md).

## The rule

Two changes, and the second is why the first was not enough on its own.

**A busy port relocates the run instead of stopping it.** Under `CI` the E2E config claims a
pair before anything reads a port: it probes the requested pair, and if either is taken it steps
both by 100 and asks again, up to ten times. The choice is exported as `E2E_WEB_PORT` and
`E2E_API_PORT` so the two web servers and every worker inherit it, and written to
`e2e/.last-ports.json` so a person can find the run that is going. Only after ten occupied pairs
does it refuse, and the refusal names the reaper.

**Servers nobody is waiting for are killed before the ports are read.**
`scripts/reap-stale-servers.mjs` runs first, and kills a process only when four things hold at
once: its command line names this repository or one of its workspaces; it is a dev script, a Nest
watcher, a Next dev server or a compiled `apps/api/dist/main`; it is older than two hours; and
nothing in its process tree is listening on 3000 or 4000. `E2E_REAP=0` disables it,
`npm run reap:dry` shows what it would do.

## What it replaces

0005 made the ports movable and told the operator to move them: the guard threw with the command
to re-run. That is the right instruction and it is one an agent cannot take — it is already
inside the run that just died, and the next thing it does is report the suite unrunnable or,
worse, reuse whatever is listening. The instruction assumed a person reading a terminal.

The reaper exists because relocation alone treats the symptom. A `npm run dev` an agent started
and never stopped survives its session, and it is not passive: the watcher recompiles on every
file the next agent touches, and it holds `node_modules/.prisma/client/query_engine-windows.dll.node`
open, so `prisma generate` fails with `EPERM: operation not permitted, rename`. The symptoms
surface nowhere near the cause — 176 type errors in files nobody edited, an EPERM on a rename, a
port conflict — and each costs a session to diagnose. Two such servers were found on this machine,
from the two preceding days.

## Why the criteria are what they are

**Age, not orphanhood.** "Its parent is gone" is the intuitive test for a stale server and it is a
trap: Windows reuses process ids, so a child list built from `ParentProcessId` picks up processes
that merely inherited a dead pid. Walking such a tree once reached out of this repository and
killed a `nest start --watch` belonging to `ds-lab-qa` — the mistake that produced this record.
Age is coarser and cannot do that. Where the reaper does descend into children it requires each
child to be younger than its parent, which no reused pid can fake.

**The protected port is asked of the whole tree.** A person's pair is started with `npm run dev`,
and that npm process holds no port at all — the port is two processes further down. Judging a
candidate by its own ports would spare the server on 3000 and kill everything holding it up.

**Two hours.** Long enough that no run in progress is ever a candidate — the servers a run is
about to start are seconds old, and so is every process of the agent doing the reaping — and short
enough that yesterday's leftovers are gone before they cost anything.

## What it costs

**A kill decided by heuristic.** A dev server of this repository, left running deliberately for
more than two hours on a port other than 3000 or 4000, is killed by the next E2E run. The escape
is `E2E_REAP=0`, and the protected list is `E2E_REAP_PROTECT`.

**A platform-specific inventory.** Process ids, ages, command lines and listening ports have no
portable source, so there is a PowerShell path and a `ps` + `lsof` path. A platform that answers
neither reaps nothing, which is the safe direction: on a runner without `lsof` the protected-port
rule cannot be enforced, so nothing is killed.

**A run can now be somewhere unexpected.** Before, a busy port stopped everything and the operator
chose. Now the run moves on its own, and the line saying where it went is one line of stderr among
a compiling Next server's. `e2e/.last-ports.json` is the answer to "where did it actually go".
