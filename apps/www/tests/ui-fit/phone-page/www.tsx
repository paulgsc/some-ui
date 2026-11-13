/**
 * www's phone screens and the shared parts they draw, on fakes, for
 * `../stays-put-www.spec.ts` (HS1): the phone-full prompt the shell mounts
 * over every page (`StoragePrompt`, its offer `RemoveOffer`), a take item
 * whose phone fills up (`TakeList` with `full`), and "Keep on this account"
 * (`KeepOnShelf`) on a shelf that answers as the walk says. Each part in the
 * flow is followed by the controls its screen has after it, so a move is
 * seen; what happens without a tap is the spec's (`./fit-actions.ts`).
 * Inline styles for any frame: this directory is outside www's Tailwind
 * sources (style.context.ts).
 */
import type { JSX, ReactNode } from "react"
import { useState, useSyncExternalStore } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { failed, idle, succeeded, working } from "@some-ui/intent-kit"
import type { ShelfPort } from "@some-ui/shared"
import { Button, KeepOnShelf, TakeList } from "@some-ui/shared"
import type { PatternTake } from "@some-ui/voice-capture"
import { simulatedPattern } from "@some-ui/voice-capture/testing"

import type { RemovableSession } from "@/lib/device-backend/handlers/sessions"
import type { DeviceStorageView } from "@/lib/device-backend/storage-view"
import type { LetGoRun } from "@/lib/home-link/study-let-go"
import { JobsScout } from "@/components/jobs/scout"
import { DeviceSection } from "@/components/settings/device-section"
import {
  RemoveOffer,
  StoragePrompt,
} from "@/components/settings/device-storage"

import type { FitActions } from "./fit-actions"
import { useFitActions } from "./fit-actions"
import type { ShelfAnswer } from "./shelf"
import { memoryShelf } from "./shelf"

const column = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
} as const

/** A screen's controls after the part under test: what a move would move. */
const After = ({ names }: { names: ReadonlyArray<string> }): JSX.Element => (
  <div style={column}>
    {names.map((name) => (
      <Button key={name} variant="outline">
        {name}
      </Button>
    ))}
    <a href="#after">A link after them all</a>
  </div>
)

const STORAGE_USE = { databaseBytes: 1, webViewBytes: 1, quotaBytes: 2 }

const SESSION: RemovableSession = {
  id: "fit-session",
  name: "Korean, week 44: the longest name a session is given here",
  finishedAt: "2026-10-30T09:00:00.000Z",
}

const RETRYABLE = {
  kind: "unreachable",
  retryable: true,
  summary: "Home didn't answer.",
  cause: null,
} as const

/**
 * The phone-full prompt where the shell mounts it, over a page's body
 * (src/routes/_dashboard.tsx), on a view and a let-go the spec moves.
 */
const StorageFixture = (): JSX.Element => {
  const [view, setView] = useState<DeviceStorageView | null>({
    use: STORAGE_USE,
    notice: null,
    full: null,
  })
  const [state, setState] = useState<Intent<LetGoRun>>(idle<LetGoRun>())
  const refuse = (removable: RemovableSession | null): void => {
    setState(idle<LetGoRun>())
    setView((now) => now && { ...now, full: { removable } })
  }
  useFitActions({
    refuse: () => refuse(null),
    refuseOffering: () => refuse(SESSION),
    notice: () => setView((now) => now && { ...now, notice: { rounds: 12 } }),
    stays: () =>
      setState(
        succeeded<LetGoRun>({ end: { kind: "unreachable" }, host: "home" })
      ),
    fails: () =>
      setState(
        failed<LetGoRun>(RETRYABLE, () => setState(working<LetGoRun>()))
      ),
  })
  const settle = (): void => setView((now) => now && { ...now, full: null })
  const offer = (session: RemovableSession): ReactNode => (
    <RemoveOffer
      key={session.id}
      session={session}
      letGo={{
        host: "home",
        promise: "home",
        state,
        start: () => setState(working<LetGoRun>()),
      }}
      onSettle={settle}
    />
  )
  return (
    <StoragePrompt
      view={view}
      renderOffer={offer}
      onSettle={settle}
      onDismiss={() => setView((now) => now && { ...now, notice: null })}
    />
  )
}

/** A take on this phone, as the take pattern's seed holds one. */
const TAKE: PatternTake = {
  id: "fit-take",
  answers: "card",
  durationMs: 47_000,
  recordedAt: "2026-10-31T09:01:00.000Z",
  standing: "current",
  kept: { place: "going" },
}

/**
 * One item's takes on the simulated microphone, as Rust Rounds' card draws
 * them; the spec fills the phone up and frees it.
 */
const TakeFullFixture = (): JSX.Element => {
  // One screen per mount, as a screen makes its pattern.
  const [{ pattern, store }] = useState(() =>
    simulatedPattern({ seed: [TAKE] })
  )
  const kept = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [full, setFull] = useState(false)
  // Home's word on each take, as the screen's store reads it back.
  const [home, setHome] = useState(false)
  const takes = home
    ? kept.map((take) => ({
        ...take,
        kept: { place: "home" as const, since: "2026-12-31T23:59:00.000Z" },
      }))
    : kept
  useFitActions({
    fill: () => setFull(true),
    free: () => setFull(false),
    home: () => setHome(true),
  })
  return (
    <div style={column}>
      <TakeList
        pattern={pattern}
        answers="card"
        takes={takes}
        label="Why does this borrow outlive the function that made it?"
        describe={() =>
          "Your answer to: why does this borrow outlive the function that made it?"
        }
        full={
          full
            ? "This phone is full. Takes record again once home has some of them."
            : undefined
        }
      />
      <After names={["Next card"]} />
    </div>
  )
}

const LESSON_WORDS = {
  noun: "lesson",
  source: "a lesson you made",
  unreadable: "it no longer reads as a lesson",
  replayFrom: "Make your own",
}

/** A shelf that answers each keep as the spec last said (`answer`). */
function keepShelf(): { shelf: ShelfPort; actions: FitActions } {
  let now: ShelfAnswer = "failed"
  return {
    shelf: memoryShelf({ answer: () => now }),
    actions: {
      answer: (next: ShelfAnswer): void => {
        now = next
      },
    },
  }
}

/** "Keep on this account" as topik's lesson list draws it, controls after. */
const KeepFixture = (): JSX.Element => {
  const [{ shelf, actions }] = useState(keepShelf)
  useFitActions(actions)
  return (
    <div style={column}>
      <Button variant="outline">Play the pasted drama</Button>
      <KeepOnShelf
        shelf={shelf}
        words={LESSON_WORDS}
        shelfKey="drama-a-week-of-rain-and-the-friend-not-met"
        body="{}"
      />
      <After names={["Open a scene from storage", "Start from a drama"]} />
    </div>
  )
}

/**
 * Settings → Home on an unpaired phone, alone on its page as the route draws
 * it: this page has no pairing plugin and no home, so pairing fails as it
 * does when home doesn't answer.
 */
const HomeFixture = (): JSX.Element => <DeviceSection />

export const WWW_FIXTURES = {
  /**
   * Jobs → Scout, alone on its page as the route draws it, on the app's own
   * record over this page's `localStorage`.
   */
  "www-scout": JobsScout,
  "www-home": HomeFixture,
  "www-storage": StorageFixture,
  "www-take-full": TakeFullFixture,
  "www-keep": KeepFixture,
} satisfies Record<string, () => JSX.Element>
