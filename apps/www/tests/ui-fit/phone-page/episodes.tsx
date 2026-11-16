/**
 * Studio's Episodes, by week (EPISODES2, #3067), as the phone draws it, for
 * `../episodes-fit.spec.ts`: every genre mixed with the widest words a row
 * says (a long cards essay title, a week of the call in three parts, a
 * length), one genre, a feed that couldn't be read, and a phone not paired.
 * Each is mounted under a router of its own, since its rows are links.
 */
import type { JSX } from "react"
import { useState } from "react"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"

import type { Episode } from "@/lib/call-videos/model"
import type { Chip, FeedLists } from "@/lib/episodes-feed"
import { feedView } from "@/lib/episodes-feed"
import { EpisodesView } from "@/components/studio/episodes-by-week"

const episode = (key: string, over: Partial<Episode> = {}): Episode => ({
  key,
  videoBytes: 1_000,
  restBytes: 10,
  link: null,
  receipts: [],
  ...over,
})

const LINK = { url: "https://youtu.be/sample", recordedAt: "2026-11-14" }

const LISTS: FeedLists = {
  call: {
    kind: "read",
    episodes: [
      ...[1, 2, 3].map((part) =>
        episode(part === 1 ? "2026-11-06" : `2026-11-06-p${String(part)}`, {
          week: "2026-11-06",
          part,
          of: 3,
          link: part === 1 ? LINK : null,
          date: "2026-11-06",
          durationMs: 596_000,
          weekDurationMs: 1_788_000,
        })
      ),
      episode("2026-10-30", { link: LINK }),
    ],
  },
  "cards-essay": {
    kind: "read",
    episodes: [
      episode("rust-scratchpad-2026-11-14", {
        title:
          "How the phone pairs with home, and what each side keeps once it has, checked claim by claim against both repositories",
      }),
      episode("phone-pairing-2026-11-12", { videoBytes: null }),
    ],
  },
  "interview-essay": {
    kind: "read",
    episodes: [episode("2026-w46", { date: "2026-11-09" })],
  },
  "playoff-delta": {
    kind: "read",
    episodes: [episode("2026-SF-10", { link: LINK }), episode("2026-SF-00")],
  },
  "rust-essay": {
    kind: "read",
    episodes: [episode("2026-w45", { durationMs: 845_000 })],
  },
}

const routed = (Screen: () => JSX.Element): (() => JSX.Element) => {
  const Routed = (): JSX.Element => {
    const [router] = useState(() =>
      createRouter({
        routeTree: createRootRoute({ component: Screen }),
        history: createMemoryHistory({ initialEntries: ["/journal/episodes"] }),
      })
    )
    return <RouterProvider router={router} />
  }
  return Routed
}

const noop = (): void => undefined

const shown = (lists: FeedLists, chip: Chip): (() => JSX.Element) => {
  const Shown = (): JSX.Element => (
    <EpisodesView
      view={feedView(lists, chip)}
      chip={chip}
      chips
      pair={<a href="/settings">Pair with home</a>}
      thisMonday="2026-11-09"
      onTryAgain={noop}
    />
  )
  return Shown
}

export const EPISODES_FIXTURES = {
  "episodes-all": routed(shown(LISTS, "all")),
  "episodes-call": routed(shown(LISTS, "call")),
  "episodes-trouble": routed(
    shown({ ...LISTS, "playoff-delta": { kind: "away" } }, "all")
  ),
  "episodes-unpaired": routed(
    shown({ ...LISTS, call: { kind: "unpaired" } }, "all")
  ),
} satisfies Record<string, () => JSX.Element>

export type EpisodesId = keyof typeof EPISODES_FIXTURES
