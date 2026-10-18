/**
 * The Jobs record kept on home, wired: one runtime per page load over the
 * app's home link and the Jobs record (`./kept-runtime`), and what asks it
 * to run (LA10, docs/learner-data-authority.md).
 *
 * Only once its person opted in (`keepJobsOnHome`, from the Record view's
 * second press), and only while the Jobs wing is open (its layout mounts
 * `useJobsHome`) with the app in the foreground. Then it asks when the wing opens, when an event is added on this
 * phone, when the app comes back to the foreground, when the network comes
 * back, when the phone is paired, and when the link frees up after turning a
 * run away busy. Never on a timer.
 *
 * `lib/jobs` is the phone's alone, so only the Jobs screens import it: they
 * hand its record and its exchange in (`JobsKeeping`), and this module names
 * neither.
 */
import { useEffect, useSyncExternalStore } from "react"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"

import { homeLink } from "./index"
import type { KeptState } from "./kept-model"
import type { Kept } from "./kept-runtime"
import { createKept } from "./kept-runtime"

export type { KeptState } from "./kept-model"

/** The Jobs record as this lane sees it, and one exchange with home over it. */
export type JobsKeeping = {
  /** Whether its person keeps the record on home. */
  kept: () => boolean
  /** How many events the log holds: a new one asks for a run. */
  size: () => number
  subscribe: (listener: () => void) => () => void
  /** Its person's second press; false when the phone would not keep it. */
  keepOnHome: () => boolean
  exchange: (send: HomeCall) => Promise<HomeExchanged>
}

let home: Kept | null = null

/** One runtime per page load, over the first `jobs` handed in. */
function jobsHome(jobs: JobsKeeping): Kept {
  home ??= createKept({
    exchange: (send) => jobs.exchange(send),
    keep: (run) => homeLink().keep(run),
    paired: () => homeLink().getSnapshot().link.kind === "paired",
    now: Date.now,
  })
  return home
}

/** Asks for a run when the record is kept on home and the app is in front. */
function ask(jobs: JobsKeeping, doc: Document): void {
  if (!jobs.kept()) return
  if (doc.visibilityState !== "visible") return
  jobsHome(jobs).want()
}

/**
 * Asks once now and on each of the moments above, until the returned
 * unsubscribe is called.
 */
function watchJobs(
  jobs: JobsKeeping,
  doc: Document = document,
  win: Window = window
): () => void {
  const link = homeLink()
  let size = jobs.size()
  let kept = jobs.kept()
  let paired = link.getSnapshot().link.kind === "paired"
  let idle = link.getSnapshot().activity.kind === "idle"

  const onRecord = (): void => {
    const nowSize = jobs.size()
    const nowKept = jobs.kept()
    const changed = nowSize !== size || (nowKept && !kept)
    size = nowSize
    kept = nowKept
    if (changed) ask(jobs, doc)
  }
  const onLink = (): void => {
    const { link: pairing, activity } = link.getSnapshot()
    const nowPaired = pairing.kind === "paired"
    const nowIdle = activity.kind === "idle"
    const freed = nowIdle && !idle
    const turnedAway = jobsHome(jobs).getSnapshot().last?.kind === "busy"
    if ((nowPaired && !paired) || (freed && turnedAway)) ask(jobs, doc)
    paired = nowPaired
    idle = nowIdle
  }
  const onBack = (): void => {
    ask(jobs, doc)
  }

  const unsubscribeRecord = jobs.subscribe(onRecord)
  const unsubscribeLink = link.subscribe(onLink)
  doc.addEventListener("visibilitychange", onBack)
  win.addEventListener("online", onBack)
  ask(jobs, doc)
  return () => {
    unsubscribeRecord()
    unsubscribeLink()
    doc.removeEventListener("visibilitychange", onBack)
    win.removeEventListener("online", onBack)
  }
}

/** The watch above, for as long as the Jobs wing is mounted. */
export function useJobsHome(jobs: JobsKeeping): void {
  useEffect(() => watchJobs(jobs), [jobs])
}

/** How keeping on home is going, for the Record view's strip. */
export function useJobsRun(jobs: JobsKeeping): KeptState {
  const current = jobsHome(jobs)
  return useSyncExternalStore(current.subscribe, current.getSnapshot)
}

/**
 * The opt-in's second press: the record is kept on home from now on. The
 * switch is a change to the record, so the watch asks for the first run.
 */
export function keepJobsOnHome(jobs: JobsKeeping): boolean {
  return jobs.keepOnHome()
}

/** "Try now": asks for a run, as any other moment above would. */
export function askJobs(jobs: JobsKeeping): void {
  ask(jobs, document)
}
