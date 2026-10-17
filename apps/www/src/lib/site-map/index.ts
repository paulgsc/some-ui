import type { Audience } from "@some-ui/vite-config/audience"
import type { LucideIcon } from "lucide-react"
import {
  BookOpenText,
  Compass,
  FileText,
  Keyboard,
  Puzzle,
  Sparkles,
  Trophy,
} from "lucide-react"

import { hasAudience, MOBILE_APP } from "@/lib/build-profile"

/**
 * The site's one catalog of destinations, read by the two places that offer
 * them: the landing's cards (`routes/index.tsx`) and the dashboard's site
 * launcher (`components/site-launcher`), for the pages the sidebar does not
 * hold. Each entry says where it appears.
 *
 * A3 (packages/some-vite-config/AUDIENCES.md): a destination on a gated route
 * names that route's audience, and `destinationsHere` drops it from a build
 * without the audience, so no link to it is ever rendered there.
 */
export type Destination = {
  readonly to:
    | "/app"
    | "/resume"
    | "/playoff-delta"
    | "/extensions"
    | "/mission"
    | "/lessons"
    | "/rounds"
    | "/resume-build"
  readonly title: string
  readonly blurb: string
  readonly icon: LucideIcon
  /**
   * The audience whose build serves the page. Every "lan" page also needs a
   * passkey session (`routes/_dashboard/_lan.tsx`).
   */
  readonly audience: Audience
  /** Its group in the site launcher; absent where the sidebar holds it. */
  readonly launcher?: DestinationGroup
  /** Its call to action as a landing card; absent for no card. */
  readonly landing?: string
  /**
   * Where it is published, as the home network's foyer lists it under
   * "Published from here". Absent for a page only the home network serves.
   */
  readonly channel?: string
  /**
   * A short demo video's YouTube id. A demo shows only where one exists, and
   * loads only when asked (`components/demo-link`).
   */
  readonly demo?: string
}

export type DestinationGroup = "home-network" | "showcase"

/** Every group's heading; a new group does not typecheck without one. */
export const GROUP_TITLE: Readonly<Record<DestinationGroup, string>> = {
  "home-network": "Home network",
  showcase: "Around the site",
}

const DESTINATIONS: ReadonlyArray<Destination> = [
  {
    to: "/lessons",
    title: "Lessons",
    blurb: "The TOPIK curriculum and its weekly batch.",
    icon: BookOpenText,
    audience: "lan",
    launcher: "home-network",
  },
  {
    to: "/rounds",
    title: "Rounds",
    blurb: "The LeetType rounds every learner plays.",
    icon: Keyboard,
    audience: "lan",
    launcher: "home-network",
  },
  {
    to: "/resume-build",
    title: "Résumé with contact details",
    blurb:
      "An ATS résumé built with the phone number and address left out of git.",
    icon: FileText,
    audience: "lan",
    launcher: "home-network",
  },
  {
    to: "/app",
    title: "Adaptive learning sessions",
    blurb:
      "Compose and run focused study sessions - Hangul Honeycomb, TOPIK practice, and timed code-typing drills.",
    icon: Sparkles,
    audience: "public",
    landing: "Open the app",
    channel: "Pages",
  },
  {
    to: "/playoff-delta",
    title: "Playoff Delta",
    blurb:
      "One NFL team's week as a story: how bad can they be, and still make the playoffs?",
    icon: Trophy,
    audience: "web",
    launcher: "showcase",
    landing: "Watch a week",
    channel: "Pages",
  },
  {
    to: "/extensions",
    title: "Browser extensions",
    blurb: "Five small tools for your browser, and what each one sends.",
    icon: Puzzle,
    audience: "public",
    launcher: "showcase",
    landing: "See the five",
    channel: "Pages · addons.mozilla.org",
  },
  {
    to: "/resume",
    title: "Résumé & background",
    blurb: "Paul Gathondu's résumé, previewable inline or as a PDF.",
    icon: FileText,
    audience: "public",
    landing: "View résumé",
    channel: "Pages",
  },
  {
    to: "/mission",
    title: "Mission",
    blurb: "Why any of this exists.",
    icon: Compass,
    audience: "public",
    launcher: "showcase",
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
