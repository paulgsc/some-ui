/**
 * A run like the one the Cooking page was drawn from (2026-11-22): deploy
 * home behind two merges and the owner's step, the APK built and waiting
 * on the owner, the essay waiting on both, and the bumps in their checks.
 */
import type { RunFile } from "@some-ui/video-render"
import { refKey, RUN_SCHEMA } from "@some-ui/video-render"

import type {
  AskFacts,
  Facts,
  PrFacts,
  RunFacts,
  Train,
} from "@/lib/cooking/model"
import { runKey, trainsOf } from "@/lib/cooking/model"

const ask3433 = { repo: "some-ui", kind: "issue", number: 3433 } as const

export const RUN: RunFile = {
  schema: RUN_SCHEMA,
  day: "2026-11-22",
  goals: [
    {
      id: "G1",
      kind: "deploy-home",
      title: "Deploy home",
      dest: "Home runs today's release",
      motive: "Home runs the newest release.",
      legs: [
        {
          leg: "merge",
          pr: { repo: "server", kind: "pr", number: 1125 },
          says: "Home's image staged",
        },
        {
          leg: "merge",
          pr: { repo: "server", kind: "pr", number: 1129 },
          says: "Home's release",
        },
        { leg: "yours", ask: ask3433, step: 1 },
      ],
    },
    {
      id: "G2",
      kind: "install-apk",
      title: "Install the latest APK",
      dest: "The new app on your S21",
      motive: "The phone gets today's app.",
      legs: [
        {
          leg: "run",
          repo: "some-ui",
          run: 45065710340,
          says: "The APK is built",
        },
        { leg: "yours", ask: ask3433, step: 4 },
      ],
    },
    {
      id: "G3",
      kind: "watch-on-phone",
      title: "Watch the Rust essay",
      dest: "The w47 essay on your phone",
      motive: "It waits on two takes home couldn't hear.",
      legs: [
        { leg: "goal", goal: "G1" },
        { leg: "goal", goal: "G2" },
        { leg: "home", says: "Home renders the essay" },
      ],
    },
    {
      id: "G5",
      kind: "land-change",
      title: "Merge the dependency bumps",
      dest: "Ten bumps in main",
      motive: "Nothing on this line is yours.",
      legs: [
        {
          leg: "merge",
          pr: { repo: "some-ui", kind: "pr", number: 3432 },
          says: "The checks finish",
        },
      ],
    },
    {
      id: "G7",
      kind: "land-change",
      title: "Move to Playwright 1.65.1",
      dest: "Playwright 1.65.1, proven on home",
      motive: "The one bump left out.",
      legs: [
        { leg: "yours", says: "You start the move", canWait: true },
        { leg: "work", worker: "CUBE", says: "Claude moves the pins" },
      ],
    },
  ],
  workers: [
    {
      tag: "CUBE",
      session: "session_01LDpdUGBcEKtg1j13dMLatw",
      repo: "some-ui",
      branches: ["claude/landing-cube"],
      phase: "building",
      log: [{ at: "2026-11-22T20:53:55Z", says: "Pushed the cube." }],
    },
  ],
  cleared: [],
}

const pr = (more: Partial<PrFacts>): PrFacts => ({
  url: "https://github.com/paulgsc/server/pull/1",
  state: "open",
  openedAt: "2026-11-22T18:05:00Z",
  mergedAt: null,
  checks: { waiting: 0, running: 0, passed: 4, failed: 0, approval: 0 },
  ...more,
})

const run = (more: Partial<RunFacts>): RunFacts => ({
  url: "https://github.com/paulgsc/some-ui/actions/runs/45065710340",
  state: "passed",
  startedAt: "2026-11-22T20:18:41Z",
  endedAt: "2026-11-22T20:43:45Z",
  ...more,
})

const ask: AskFacts = {
  url: "https://github.com/paulgsc/some-ui/issues/3433",
  open: true,
  filedAt: "2026-11-22T20:39:20Z",
  question: "Will you deploy home and install the new APK?",
  steps: [
    "Remove the retired speech containers",
    "Deploy home",
    "Check the mailbox bell",
    "Approve the APK build",
    "Install the APK",
  ],
}

export const FACTS: Facts = {
  prs: new Map([
    [
      refKey({ repo: "server", number: 1125 }),
      pr({ state: "merged", mergedAt: "2026-11-22T21:00:00Z" }),
    ],
    [
      refKey({ repo: "server", number: 1129 }),
      pr({
        checks: { waiting: 0, running: 2, passed: 3, failed: 0, approval: 0 },
      }),
    ],
    [
      refKey({ repo: "some-ui", number: 3432 }),
      pr({
        openedAt: "2026-11-22T19:39:24Z",
        checks: { waiting: 1, running: 0, passed: 13, failed: 0, approval: 0 },
      }),
    ],
  ]),
  runs: new Map([[runKey("some-ui", 45065710340), run({})]]),
  asks: new Map([[refKey(ask3433), ask]]),
}

export const factsWith = (more: Partial<Facts>): Facts => ({
  ...FACTS,
  ...more,
})
export { pr, run, ask }

/** The run's train `id`, placed by `facts`. */
export function trainOf(id: string, facts = FACTS, record = RUN): Train {
  const t = trainsOf(record, facts).find((x) => x.id === id)
  if (t === undefined) throw new Error(id)
  return t
}

/** `n` copies of `train`, ids G10 onward. */
export const copies = (train: Train, n: number): Array<Train> =>
  Array.from({ length: n }, (_, i) => ({ ...train, id: `G${String(10 + i)}` }))
