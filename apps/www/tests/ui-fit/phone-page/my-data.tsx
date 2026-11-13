/**
 * My data (MY-DATA MD2, #2476) as the phone draws it, for
 * `../my-data-fit.spec.ts`: the overview with every kind of recording and
 * the widest numbers it says, the same before home has answered, and a
 * kind's list. Each is mounted under a router of its own (a root and
 * nothing else), since its rows are route links.
 */
import type { JSX } from "react"
import { useState } from "react"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"

import type { HomeReading, PhoneNote } from "@/lib/my-data/model"
import { kindOf, KINDS, overviewOf } from "@/lib/my-data/model"
import {
  MyDataKind,
  MyDataOverview,
} from "@/components/settings/device-my-data"

const NOW = new Date("2026-11-02T12:00:00Z")
const MB = 1024 * 1024

/** Home holding every kind, the biggest with over a thousand megabytes. */
const HOME: HomeReading = {
  kind: "read",
  kept: {
    kinds: KINDS.map((of, i) => ({
      of,
      notes: 12_345 - i * 1_000,
      bytes: (1_234.5 - i * 120) * MB,
      setAside: 321,
      since: "2025-09-12T10:00:00.000Z",
    })),
    weeks: Array.from({ length: 20 }, (_, i) => ({
      week: new Date(Date.UTC(2026, 5, 22 + i * 7)).toISOString().slice(0, 10),
      notes: 40,
      bytes: 90 * MB,
      leftNotes: 0,
      leftBytes: 0,
    })),
    notes: Array.from({ length: 50 }, (_, i) => ({
      id: `home-${i}`,
      recordedAt: new Date(
        Date.UTC(2026, 9, 30, 23, 59) - i * 3_600_000
      ).toISOString(),
      storedAt: "2026-10-31T00:00:00.000Z",
      size: 1_000_000,
      setAsideAt: i % 3 === 0 ? "2026-10-31T00:00:00.000Z" : null,
      // As home will mark takes once they're switched on (MD3): every row
      // that offers Delete… is drawn beside those that don't.
      deletable: i % 2 === 0,
      // Each way a row says what it is (MD8): long words, none heard, not
      // heard yet, and one whose audio home keeps to itself.
      durationMs: i % 4 === 2 ? null : 30_000 + i * 61_000,
      heard:
        i % 4 === 0
          ? "So what I keep coming back to is that the second scene doesn't earn the turn, and the whole middle sags because of it"
          : null,
      playsBack: i % 4 !== 3,
    })),
  },
}

const PHONE: ReadonlyArray<PhoneNote> = Array.from({ length: 6 }, (_, i) => ({
  id: `phone-${i}`,
  of: "studio",
  at: new Date(Date.UTC(2026, 10, 1, 21, 12) - i * 60_000).toISOString(),
  bytes: 999_999,
  held: false,
  going: i % 2 === 0,
}))

const routed = (Screen: () => JSX.Element): (() => JSX.Element) => {
  const Routed = (): JSX.Element => {
    const [router] = useState(() =>
      createRouter({
        routeTree: createRootRoute({ component: Screen }),
        history: createMemoryHistory({ initialEntries: ["/settings/data"] }),
      })
    )
    return <RouterProvider router={router} />
  }
  return Routed
}

const noop = (): void => undefined

export const MY_DATA_FIXTURES = {
  "my-data": routed(() => (
    <MyDataOverview overview={overviewOf(HOME, PHONE, NOW)} />
  )),
  "my-data-unpaired": routed(() => (
    <MyDataOverview overview={overviewOf({ kind: "unpaired" }, PHONE, NOW)} />
  )),
  "my-data-kind": routed(() => (
    <MyDataKind
      view={kindOf("studio", "studio", HOME, PHONE, NOW)}
      playing="phone-0"
      onPlay={noop}
      onStop={noop}
      onDelete={noop}
    />
  )),
} satisfies Record<string, () => JSX.Element>

export type MyDataId = keyof typeof MY_DATA_FIXTURES
