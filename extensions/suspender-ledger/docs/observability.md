# Observability

Suspender Ledger can explain itself. It records what it decided, what it
believes, and whether its own invariants still hold — all locally, all bounded,
and all readable from `debug.html`.

The distinction that shapes every decision below: **telemetry** implies data
leaving the machine; **observability** just means the system can account for
itself. This is the second thing. There is no network path anywhere in the
subsystem, and none is planned.

---

## Why this exists

The extension had a reliability bug that was effectively undiagnosable with the
tools available: tabs sporadically stopped being suspended, with no error, no
failing call, and nothing in any log — because nothing was failing. The
scheduler simply never ran (see [The scheduler bug](#the-scheduler-bug) below).

`console.log` cannot answer that class of question. By the time a user notices
"my tabs stopped suspending", the console is closed, the event page has been
recycled a hundred times, and every line of evidence is gone. What is needed is
a flight recorder: bounded, persistent, and readable after the fact.

---

## Architecture

Everything generic lives in `@some-extension/common/observability`; this
extension supplies only the parts that carry domain meaning.

```
              browser APIs / decisions
                        │
                        ▼
                 record(event)                  ← worker/core/observability.ts
                        │
     ┌──────────────────┼──────────────────┐
     ▼                  ▼                  ▼
 RingBuffer        MetricsStore        snapshots
 (500 events)   (counters + timings)  ("what I believe")
     │                  │                  │
     └──────────────────┼──────────────────┘
                        ▼
                 invariant checks  ──► HealthReport
                        │
                        ▼
                    debug.html  ──► Export JSON (user-initiated)
```

| Layer                                                                     | Where                                  |
| ------------------------------------------------------------------------- | -------------------------------------- |
| Ring buffer, metrics, invariant runner, health scoring, persistence ports | `extensions/common/src/observability/` |
| Event kinds, counters, invariants, context collector                      | `src/worker/core/observability.ts`     |
| `trace()` shim over the recorder                                          | `src/worker/core/trace.ts`             |
| Diagnostics page                                                          | `debug.html` + `src/debug/`            |

### The adapter seam

Adapting a second extension means writing one file — its own
`observability.ts` — and nothing else:

```ts
export type MyEventKind = "job.started" | "job.failed" | …
export type MyCounter   = "jobs_run" | "jobs_failed" | …
export type MyAggregate = "job_duration_ms"

export const myInvariants: ReadonlyArray<Invariant<MyContext>> = [ … ]

export const obs = new Recorder<MyEventKind, MyCounter, MyAggregate, MyContext>({
  namespace: "my-extension",
  invariants: myInvariants,
  persistence: extensionStoragePersistence({ key: "mx.observability.v1" }),
})
```

The core knows about _shapes_; the adapter knows about _meanings_. Invariants
are pure functions of a context object the adapter gathers, so they unit-test
against plain object literals with no browser mock at all.

---

## Storage discipline

An extension that runs for months must have a **constant** upper bound on what
it keeps. Four independent limits enforce that:

| Limit                    | Default  | What it bounds                          |
| ------------------------ | -------- | --------------------------------------- |
| Ring buffer capacity     | 500      | Retained events; oldest overwritten     |
| Per-event `detail` clamp | 2 KB     | One fat payload cannot eat the buffer   |
| Snapshot map cap         | 200 keys | Per-tab beliefs; oldest-written evicted |
| Persisted bundle budget  | 256 KB   | Events shed oldest-first until it fits  |

Writes are debounced (1 s) and whole-bundle under a single key, so a worker
killed mid-write leaves the previous bundle intact rather than a half-applied
delta. `error`-severity events bypass the debounce, because an error is the
event most likely to be followed by the worker dying.

Per-tab snapshots are dropped on `tabs.onRemoved`, so the map tracks the
current profile rather than every tab ever opened.

---

## What is recorded — and what is not

Tab URLs are recorded as **origin only** (`https://example.com`, never the path
or query string). The questions this subsystem exists to answer — "why wasn't
this tab suspended?" — are fully answerable from the origin plus the skip
reason. A full URL is browsing content, and browsing content has no business
being written to disk for diagnostics.

Nothing is recorded from page content. No titles are stored (only whether a
title _changed_), no form values, no history.

**AMO posture:** this is offline diagnostics, the model Mozilla is most
comfortable with — everything stays on the user's machine unless they
explicitly choose to share it, via the Export JSON button. The manifest's
`data_collection_permissions` remains `["none"]`, correctly: no data is
collected in the sense AMO means it.

---

## The diagnostics page

Reachable from the popup's **Diagnostics** link, or directly at
`moz-extension://<id>/debug.html`.

- **Health** — the 0–100 score, plus every invariant with its current status.
  A violated invariant names the thing that broke, which is usually much nearer
  the root cause than the symptom a user reports.
- **Metrics** — counters (`suspend_attempts`, `suspend_noop`, `alarm_fires`, …)
  and timing aggregates (avg/min/max, no histogram buckets — see storage
  discipline).
- **Current beliefs** — snapshots. Events say what happened; these say what
  state that left behind. This is what answers "this tab never woke up."
- **Timeline** — the ring buffer, newest first, filterable by event kind and by
  tab id. Filtering to one tab id gives that tab's whole story in order.
- **Export JSON** — the user-attachable bundle for a GitHub issue: health,
  metrics, beliefs, and the full retained timeline.

The page asks the _worker_ for its bundle rather than reading storage directly.
The worker holds the live in-memory buffer (fresher than the last debounced
flush), only the worker can evaluate invariants needing `tabs.query`, and
sending a message wakes a recycled event page — so the page never reports on a
worker that is merely asleep.

---

## Invariants

| Name                        | What it catches                                                 |
| --------------------------- | --------------------------------------------------------------- |
| `SchedulerAlarmExists`      | Suspending is enabled but no sweep alarm is registered          |
| `SchedulerAlarmNotStale`    | The alarm exists but is long past due                           |
| `CheckRanRecently`          | No sweep in three intervals — **the scheduler bug's signature** |
| `NoActiveTabSuspended`      | The foreground tab is discarded                                 |
| `NoStrandedMarkerOnLiveTab` | A live tab wears 💤 — a rollback that never completed           |
| `NoStuckInFlightSuspend`    | An attempt has been in flight over a minute, blocking that tab  |

An invariant that cannot be evaluated reports `unknown`, never `violated`. An
un-evaluable check is not evidence of breakage, and a health score that cries
wolf on a fresh profile is worse than no score.

---

## The scheduler bug

Recorded here because it is the reason the subsystem exists, and because the
shape of it is worth recognising again.

`number.install()` created the periodic sweep alarm with
`when: Date.now() + period`. It is called from a `starters` callback, and
`starters` run at **module evaluation on every worker generation** — MV3 event
pages are recycled aggressively, and neither `onStartup` nor `onInstalled`
fires on a respawn, so the startup gate has to open unconditionally.

The extension registers `tabs.onUpdated`, `tabs.onActivated`,
`runtime.onMessage` and more, so during active browsing the event page is woken
every few seconds. Every wake re-armed the alarm from zero, pushing the next
sweep another full interval into the future. The alarm could therefore only
ever fire during a lull longer than the entire interval.

Hence the symptom: suspension works fine on an idle machine and silently never
happens while you are actually using the browser. Sporadic, not reproducible on
demand, and invisible in logs — because nothing failed. Nothing _ran_.

The fix is idempotency: create the alarm only when it is missing or its cadence
changed (`src/worker/modes/number.ts`), with a startup watchdog that notices an
absent or overdue alarm and sweeps immediately. `number.scheduler.test.ts` is
the regression suite.

Two secondary hardenings landed alongside it:

- **Silent discard no-ops.** `chrome.tabs.discard` resolves for tabs the browser
  then declines to discard. The tab stays live and keeps its 💤 marker forever,
  indistinguishable from success at the call site. The outcome is now verified
  against `tabs.get` (which reads cached metadata and cannot materialize a
  discarded tab), counted as `suspend_noop`, and rolled back.
- **Swallowed injection failures.** `executeScript` rejections in the sweep were
  discarded whole (`() => []`), making "this tab is silently never eligible"
  indistinguishable from "this tab is fine". The reason is now recorded as
  `tab.meta_error`.
