/**
 * The phone's header with the sign-in mark in each of its looks (SIGNIN1,
 * #3087), for `../sign-in-fit.spec.ts`: the row `src/routes/_dashboard.tsx`
 * draws on a wing's page, its classes copied from there (keep the two in
 * step). The way out and the gear are the shell's own, under a router of
 * their own on Practice's Home, the wing with the most in its header; the
 * wing's sharing mark is a box its size, since it reads the link. The mark
 * is `SignInMarkView` on a state made with the link's own `step`, so it asks
 * nothing.
 */

import type { JSX } from "react"
import { useState } from "react"
import { NoticeLayer } from "@some-ui/shared"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"

import type { HomeLinkState } from "@/lib/home-link"
import type { HomeLinkEvent } from "@/lib/home-link/model"
import { INITIAL, step } from "@/lib/home-link/model"
import { SignInMarkView } from "@/components/device-sign-in-mark"
import { MobileSettingsLink, MobileWayOut } from "@/components/mobile-shell"

const AT = "/practice"
const BASE = "https://file-host.home.example/api/v1"
const PAIRED: HomeLinkEvent = {
  type: "read",
  found: { base: BASE, id: "p1", since: Date.UTC(2026, 10, 17, 9) },
}

const run = (...events: ReadonlyArray<HomeLinkEvent>): HomeLinkState =>
  events.reduce(step, INITIAL)

/** Each look of the mark, by the state that shows it. */
const LOOKS = {
  reading: INITIAL,
  out: run({ type: "read", found: null }),
  in: run(PAIRED, { type: "heard", id: "p1", known: true, at: 1 }),
  away: run(PAIRED, { type: "unanswered", now: 1 }),
  lost: run(PAIRED, {
    type: "heard",
    id: "p1",
    known: false,
    at: Date.UTC(2026, 10, 17, 10),
  }),
} as const

/** The header row for `state`, as a route's component. */
const HeaderRow = ({ state }: { state: HomeLinkState }): JSX.Element => (
  // The shell's notice plane, under its header (`top-16`).
  <NoticeLayer className="top-16">
    {/* At the screen's top, where the shell's header is, so the notice
        plane falls under it as in the app; the page keeps the same 56px
        for it (`./main.tsx`). Inline, since this directory is outside
        www's Tailwind sources. */}
    <header
      className="bg-background flex h-14 shrink-0 items-center gap-2 border-b px-4"
      style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 10 }}
    >
      <MobileWayOut pathname={AT} bounded={false} />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <MobileSettingsLink pathname={AT} />
        {/* The wing's sharing mark's room (`DeviceHomeGlyph`). */}
        <span aria-hidden className="size-10 shrink-0" />
        <SignInMarkView state={state} />
      </div>
    </header>
  </NoticeLayer>
)

/** Each look's row, a component of its own for its router's root. */
const ROWS: Record<keyof typeof LOOKS, () => JSX.Element> = {
  reading: (): JSX.Element => <HeaderRow state={LOOKS.reading} />,
  out: (): JSX.Element => <HeaderRow state={LOOKS.out} />,
  in: (): JSX.Element => <HeaderRow state={LOOKS.in} />,
  away: (): JSX.Element => <HeaderRow state={LOOKS.away} />,
  lost: (): JSX.Element => <HeaderRow state={LOOKS.lost} />,
}

/** One look's header under a router of its own; a fixture never changes look. */
const Routed = ({
  initialLook,
}: {
  initialLook: keyof typeof LOOKS
}): JSX.Element => {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({ component: ROWS[initialLook] }),
      history: createMemoryHistory({ initialEntries: [AT] }),
    })
  )
  return <RouterProvider router={router} />
}

export const SIGN_IN_FIXTURES = {
  "sign-in-reading": (): JSX.Element => <Routed initialLook="reading" />,
  "sign-in-out": (): JSX.Element => <Routed initialLook="out" />,
  "sign-in-in": (): JSX.Element => <Routed initialLook="in" />,
  "sign-in-away": (): JSX.Element => <Routed initialLook="away" />,
  "sign-in-lost": (): JSX.Element => <Routed initialLook="lost" />,
} satisfies Record<string, () => JSX.Element>
