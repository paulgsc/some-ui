import type { Audience } from "@some-ui/vite-config/audience"
import type { LucideIcon } from "lucide-react"
import {
  BookOpenText,
  Compass,
  FileText,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react"

import { hasAudience, MOBILE_APP } from "@/lib/build-profile"
import type { Purpose } from "@/lib/purpose"
import { offeredHere } from "@/lib/purpose"

/**
 * The site's one catalog of destinations, read by the two places that offer
 * them: the landing's cards (`routes/index.tsx`) and the dashboard's site
 * launcher (`components/site-launcher`), for the pages the sidebar does not
 * hold. Each entry says where it appears.
 *
 * A3 (packages/some-vite-config/AUDIENCES.md): a destination on a gated route
 * names that route's audience, and `destinationsHere` drops it from a build
 * without the audience, so no link to it is ever rendered there.
 *
 * Each also names its purpose (`lib/purpose`), and `destinationsHere` drops
 * one this build's navigation does not offer: on the home network, study and
 * making (ADM1, #2389). The page itself still loads by its address.
 */
export type Destination = {
  readonly to:
    | "/assurance"
    | "/app"
    | "/resume"
    | "/playoff-delta"
    | "/extensions"
    | "/mission"
    | "/lessons"
    | "/resume-build"
  readonly title: string
  readonly blurb: string
  readonly icon: LucideIcon
  /**
   * The audience whose build serves the page. Every "lan" page also needs a
   * passkey session (`routes/_dashboard/_lan.tsx`).
   */
  readonly audience: Audience
  /** What it is for, which decides the builds whose navigation offers it. */
  readonly purpose: Purpose
  /** Its group in the site launcher; absent where the sidebar holds it. */
  readonly launcher?: DestinationGroup
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

export type DestinationGroup = "running" | "home-network" | "showcase"

/**
 * Every group's heading, in the launcher and, for `running`, on the home
 * network's front page; a new group does not typecheck without one.
 */
export const GROUP_TITLE: Readonly<Record<DestinationGroup, string>> = {
  running: "How it's running",
  "home-network": "Home network",
  showcase: "Around the site",
}

/**
 * In display order. Administration comes first, so the home network's front
 * page and launcher lead with it.
 */
const DESTINATIONS: ReadonlyArray<Destination> = [
  // Administration: the system's health, its accounting and storage, its
  // promises. CHECKS' "Is it working?" (CK8, #2388) joins here as a "lan"
  // page in the `running` group once its route exists, as do the storage and
  // record views after it.
  {
    to: "/assurance",
    title: "Promises",
    blurb:
      "What my tools promise about outcomes and work, and the evidence for each.",
    icon: ShieldCheck,
    audience: "public",
    purpose: "administration",
    launcher: "running",
  },
  {
    to: "/lessons",
    title: "Lessons",
    blurb: "The TOPIK curriculum and its weekly batch.",
    icon: BookOpenText,
    audience: "lan",
    purpose: "making",
    launcher: "home-network",
  },
  {
    to: "/resume-build",
    title: "Résumé with contact details",
    blurb:
      "An ATS résumé built with the phone number and address left out of git.",
    icon: FileText,
    audience: "lan",
    purpose: "making",
    launcher: "home-network",
  },
  {
    to: "/app",
    title: "Adaptive learning sessions",
    blurb:
      "Compose and run focused study sessions - Hangul Honeycomb, TOPIK practice, and timed code-typing drills.",
    icon: Sparkles,
    audience: "public",
    purpose: "study",
    channel: "Pages",
  },
  {
    to: "/playoff-delta",
    title: "Playoff Delta",
    blurb:
      "One NFL team's week in numbers: the best week it could have had, how close it came, and which teams came closest.",
    icon: Trophy,
    audience: "web",
    purpose: "making",
    launcher: "showcase",
    channel: "Pages",
  },
  {
    to: "/extensions",
    title: "Browser extensions",
    blurb: "Five small tools for your browser, and what each one sends.",
    icon: Puzzle,
    audience: "public",
    purpose: "presentation",
    launcher: "showcase",
    channel: "Pages · addons.mozilla.org",
  },
  {
    to: "/resume",
    title: "Résumé & background",
    blurb: "Paul Gathondu's résumé, previewable inline or as a PDF.",
    icon: FileText,
    audience: "public",
    purpose: "presentation",
    channel: "Pages",
  },
  {
    to: "/mission",
    title: "Mission",
    blurb: "Why any of this exists.",
    icon: Compass,
    audience: "public",
    purpose: "presentation",
    launcher: "showcase",
  },
]

/**
 * The destinations this build serves and its navigation offers, in display
 * order. None in the Android app, which keeps to its own surface
 * (`lib/app-surface`).
 */
export function destinationsHere(): ReadonlyArray<Destination> {
  if (MOBILE_APP) return []
  return DESTINATIONS.filter(
    (d) => hasAudience(d.audience) && offeredHere(d.purpose)
  )
}
