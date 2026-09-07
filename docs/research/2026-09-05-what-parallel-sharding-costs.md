# What sharding costs once it actually runs in parallel

Five judge configurations over one frozen spec bundle, and the three mechanism defects that had
to be fixed before any of them measured what it claimed to.

The question this record answers: **sharding was chosen for speed. Once the children genuinely
run at the same time, is it faster, and does it find as much?** The answer is no to the second,
and only sometimes to the first.

## Ground truth

Every arm judged the same text: `specs/time-off/01-vacation-calendar.md` and its `.cases.md` and
`.contracts.md`, 1,518 lines, at commit `bf6d5ca` — the bundle as it stood before any repair.
Every arm ran `--rounds 1 --no-fix`, so what is compared is one judged round and nothing else.
Each arm ran in its own worktree at that commit with the machinery overlaid.

Numbers come from the stage logs (`duration_api_ms`, `duration_ms`, `total_cost_usd`,
`num_turns`), the verdict JSON, and file timestamps. Nothing here is an agent's summary of
itself.

Blockers are compared by **place** — the normalised `symbol` of the finding — because the same
defect is filed under different criteria by different passes.

## The three mechanism defects

None of these were about judgement. All three had to be fixed before an arm measured sharding
rather than measuring the harness.

### 1. A lead dispatches its children one message at a time

The rule "send them in one message, one call each, or they run in series" was in the lead's
definition twice. It was obeyed in no run recorded here.

| shape | children | dispatch messages | first to last | API time | wall | ratio |
|---|---|---|---|---|---|---|
| `sharded-5` | 5 | 5 | 13:04:18 – 13:07:00, 162 s | 1,558 s | 779 s | 2.0× |
| `sharded-10` | 10 | 10 | 13:17:25 – 13:21:21, 236 s | 2,303 s | 943 s | 2.4× |

Ten children bought 2.4× rather than 10×, and roughly a quarter of the wall clock went on
issuing the calls. Wording did not move this. Taking the dispatch out of the model did.

### 2. Three places told the lead how to dispatch, and two were scripts

Given a tool that dispatches every child at once and a definition saying not to call `Task`, the
lead called `Task` ten times anyway — one per message, the old failure exactly. The cause was not
the new rule but the three older ones it was competing with:

- its definition said, unconditionally and earlier in the file, *"Send every child in one message,
  one call each"*;
- `spec-slice.mjs` printed *"A shard agent is available… Send them in one message or they run in
  series"*;
- the loop's prompt offered *"a ready split: one shard per member… and the shard agent to use"*.

It followed what it read first. Stating the dispatch method **once, at the point of decision**,
and reducing both scripts to printing facts, fixed it: the next run called the dispatcher once
and `Task` zero times.

### 3. The dispatcher outlives the shell that starts it, or it is killed mid-flight

The lead's own `Bash` call has a time limit shorter than the children. It returned `Exit code 2`
about two minutes in, while all ten children went on and wrote their answers; the lead, having
no table, started polling a directory it guessed wrong and lost the round.

The dispatcher now spawns children detached, records their pids, and — run again with the same
arguments — waits on the same run rather than starting a second one. A child with no answer and
no process behind it is restarted once; a child that has answered is never restarted. Verified by
killing the watcher at eight seconds: both children died with it, and the same command reported
`2 restarted` and drove them to completion.

## The arms

| arm | dispatch | children | wall | cost | blockers | notes | enumerated |
|---|---|---|---|---|---|---|---|
| `solo-minimal` | none, 2 opus passes unioned | — | 936 s | $10.29 | **16** | 14 | 274 |
| `sharded-5` | lead, `Task`, serialised | 5 | 676 s | $5.70 | 13 | 5 | — |
| `sharded-10` | lead, `Task`, serialised | 10 | 943 s | $8.05 | 16* | 11 | — |
| `sharded-15` | loop state machine, parallel | 15 | 2,256 s | $20.27 | 12 | 20 | 527 |
| `planned-10` | lead calls one tool, parallel | 10 | 1,084 s | $11.48 | **6** | 10 | 337 |

\* `sharded-10` returned every finding with `symbol` unset, so its blockers cannot be matched to
anyone else's by place. Its count is reported and its overlap is not.

`solo-minimal` runs its two passes concurrently: 917 s + 629 s of API time inside 936 s of wall
clock. Its cost is the whole of what it spends.

### Where `sharded-15`'s time went

| phase | wall | API | cost |
|---|---|---|---|
| plan (opus) | 680 s | 675 s | $2.82 |
| 15 children (sonnet) | 569 s | 3,672 s | $10.79 |
| merge (opus) | 1,007 s | 996 s | $6.66 |
| total | 2,256 s | 5,343 s | $20.27 |

The children were parallel — 6.45× — and they are not where the time is. The two opus phases are
serial by construction and together take 1,687 s, nearly twice the whole of `solo-minimal`.
Fifteen full readings of a 1,518-line bundle on sonnet also cost more ($10.79) than two on opus
($10.29).

### Where `planned-10`'s findings went

Not to the merge. The lead kept 13 of 14 claims. The children raised almost nothing:

| | `sharded-15` | `planned-10` |
|---|---|---|
| children | 15 | 10 |
| items enumerated | 503 | 325 |
| claims raised | 53 | 14 |
| claims per item | 10.5 % | 4.3 % |

One child listed 96 items in 7 turns. Enumerating is not checking, and a child with a wide
assignment enumerates.

### Overlap by place

Of `planned-10`'s six blockers, five are also `solo-minimal`'s. `sharded-15` shares seven of
twelve with `solo-minimal` and contributes four nobody else found — `call-site adoption table`,
`days[].weekday`, `member column width`, `REQ-01-030`. Sharding does reach places a solo pass
does not; it reaches far fewer of them in total.

## Hypotheses that died

**"Sharding is slow because the model picks the wrong split."** No. It is slow because the
dispatch is serialised and because the lead pays for two full readings — one to plan, one to
merge. With a correct parallel dispatch the children take a quarter of the wall clock.

**"Fixing the parallelism will make sharding win on speed."** No. `planned-10` dispatches
correctly and still takes 1,084 s against `solo-minimal`'s 936 s, at higher cost. The
serial opus phases are the floor, and they do not shrink.

**"More children means more found."** No, in the direction measured: 15 children found 12
blockers, 10 children found 6, two opus passes found 16.

**"A deeper, narrower assignment finds more."** Not on its own. `planned-10` divided the register
cleanly, ~5 criteria per child, no overlap — and its children raised 14 claims against
`sharded-15`'s 53. What separates them is not narrowness.

**"The merge throws away what the children find."** No. `planned-10`'s lead kept 13 of 14 claims;
the shortfall is upstream, in the children.

## What is not settled

`planned-10` changed three things against `sharded-15` at once — the dispatch mechanism, the
child's prompt (the full assignment text became a pointer to the plan file), and the division
(`sharded-15` gave four cross-cutting criteria to four children over disjoint regions;
`planned-10` partitioned with no overlap). The most likely cause of the shortfall is the third —
those four overlapping children produced most of `sharded-15`'s claims — but nothing here
isolates it, and a claim that cannot be isolated is not a measurement.

That question is open, and it is worth answering only if sharding is ever wanted again for a
bundle one pass cannot hold. For a bundle this size the answer is already in the table.

## The e2e run this replaced nothing of

For completeness, the shape that is the default, run end to end on the same spec from `bf6d5ca`
with repairs enabled:

| round | T2 | fixer | next gate |
|---|---|---|---|
| 1 | blocked — 17 blockers, 13 notes | 23 repairs | — |
| 2 | **pass** — 0 blockers, 6 notes | 0 repairs | blocked at T1 |
| 3 | **pass** — 0 blockers, 1 note | 1 repair | blocked at T1 |

08:32:07 to 09:50:46, 78 minutes, stopped on `budget`. **The judge cleared the bundle after one
repair round**, and every round after that stopped at `pre-implement`, a different gate with no
criteria map and no range, which is left for a person.
