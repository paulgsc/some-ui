/**
 * The drag-down indicator (PULL0, `src/components/pull-to-check.tsx`) in
 * each phase it shows something, at the top of a page as the shell's page
 * body holds it, measured by `../pull-fit.spec.ts`. The words for "done" use
 * the widest time of day a phone says ("12:59 PM").
 */
import type { JSX } from "react"

import type { Phase } from "@/lib/pull-refresh"
import { ARM_PX, MAX_PX } from "@/lib/pull-refresh"
import { PullIndicator } from "@/components/pull-to-check"

const FROM = { x: 0, y: 0 }
const AT = 0
const WIDEST_TIME = (): string => "12:59 PM"

/** A page as a route would draw it, under the indicator. */
const Page = (): JSX.Element => (
  <section>
    <h1 style={{ fontSize: 24, fontWeight: 600 }}>Jobs</h1>
    {Array.from({ length: 12 }, (_, i) => (
      <p key={i} style={{ marginTop: 12 }}>
        A line of the page that sits under the indicator while it shows.
      </p>
    ))}
  </section>
)

const at = (phase: Phase): (() => JSX.Element) => {
  const PullFixture = (): JSX.Element => (
    <>
      <PullIndicator phase={phase} when={WIDEST_TIME} />
      <Page />
    </>
  )
  return PullFixture
}

export const PULL_FIXTURES = {
  "pull-pulling": at({ kind: "pulling", from: FROM, distance: ARM_PX / 2 }),
  "pull-armed": at({ kind: "armed", from: FROM, distance: MAX_PX }),
  "pull-checking": at({ kind: "checking", pull: 1, shown: true }),
  "pull-done": at({ kind: "done", pull: 1, at: AT }),
  "pull-failed": at({
    kind: "failed",
    pull: 1,
    at: AT,
    offline: false,
    unread: [],
  }),
  // As many names as a failure says: two, then how many more.
  "pull-failed-named": at({
    kind: "failed",
    pull: 1,
    at: AT,
    offline: false,
    unread: [
      "this page",
      "today’s digest",
      "the morning run",
      "what home holds",
    ],
  }),
  "pull-offline": at({
    kind: "failed",
    pull: 1,
    at: AT,
    offline: true,
    unread: [],
  }),
} satisfies Record<string, () => JSX.Element>

export type PullId = keyof typeof PULL_FIXTURES
