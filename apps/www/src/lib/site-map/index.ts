import type { Audience } from "@some-ui/vite-config/audience"
import type { LucideIcon } from "lucide-react"
import { BookOpenText, Compass, Keyboard, Puzzle, Trophy } from "lucide-react"

import { hasAudience, MOBILE_APP } from "@/lib/build-profile"

/**
 * The pages outside the dashboard's own navigation: standalone pages and the
 * LAN operator tools, which no sidebar item reaches. The site launcher
 * (`components/site-launcher`) offers the ones this build carries.
 *
 * A3 (packages/some-vite-config/AUDIENCES.md): a destination on a gated route
 * names that route's audience, and `destinationsHere` drops it from a build
 * without the audience, so no link to it is ever rendered there.
 */
export type Destination = {
  readonly to:
    | "/playoff-delta"
    | "/extensions"
    | "/mission"
    | "/lessons"
    | "/rounds"
  readonly title: string
  readonly blurb: string
  readonly icon: LucideIcon
  readonly group: DestinationGroup
  /**
   * The audience whose build serves the page. Every "lan" page also needs a
   * passkey session (`routes/_dashboard/_lan.tsx`).
   */
  readonly audience: Audience
}

export type DestinationGroup = "home-network" | "showcase"

const DESTINATIONS: ReadonlyArray<Destination> = [
  {
    to: "/lessons",
    title: "Lessons",
    blurb: "The TOPIK curriculum and its weekly batch.",
    icon: BookOpenText,
    group: "home-network",
    audience: "lan",
  },
  {
    to: "/rounds",
    title: "Rounds",
    blurb: "The LeetType rounds every learner plays.",
    icon: Keyboard,
    group: "home-network",
    audience: "lan",
  },
  {
    to: "/playoff-delta",
    title: "Playoff Delta",
    blurb: "How bad can a team be and still make the playoffs?",
    icon: Trophy,
    group: "showcase",
    audience: "web",
  },
  {
    to: "/extensions",
    title: "Extensions",
    blurb: "Five small tools for your browser.",
    icon: Puzzle,
    group: "showcase",
    audience: "public",
  },
  {
    to: "/mission",
    title: "Mission",
    blurb: "Why any of this exists.",
    icon: Compass,
    group: "showcase",
    audience: "public",
  },
]

/**
 * The destinations this build serves, in display order. None in the Android
 * app, which keeps to its own surface (`lib/app-surface`).
 */
export function destinationsHere(): ReadonlyArray<Destination> {
  if (MOBILE_APP) return []
  return DESTINATIONS.filter((d) => hasAudience(d.audience))
}
