/**
 * The front desk's concerns (`/settings`, `lib/wings`' `FRONT_DESK`): what
 * belongs to no wing, one page each (`/settings/<id>`), in the words the desk
 * shows (paulgsc/some-ui#2107, SM1).
 *
 * On the phone the pages are reached by a bar along the bottom, the same
 * shape as a wing's: the first four pages have a tab, and More lists the rest
 * (`deskBar`; MY-DATA MD1, paulgsc/some-ui#2475). The desktop web keeps its
 * cards.
 *
 * The phone's pages are "apk" pages, so the build is asked `hasAudience`
 * here, where they are offered (A3, packages/some-vite-config/AUDIENCES.md).
 */

import { hasAudience } from "@/lib/build-profile"
import { VIEWER_BUILD } from "@/lib/data-mode"

export type ConcernId =
  | "status"
  | "phone"
  | "home"
  | "data"
  | "appearance"
  | "account"

export type Concern = {
  readonly id: ConcernId
  readonly title: string
  /** Its label in the phone's bar, or in More's list. */
  readonly tab: string
  /** One line: what is behind the card. */
  readonly lead: string
}

/** A concern's own page. */
export const pageOf = (id: ConcernId): `/settings/${ConcernId}` =>
  `/settings/${id}`

const CONCERNS: Readonly<Record<ConcernId, Concern>> = {
  status: {
    id: "status",
    title: "How it's running",
    tab: "Running",
    lead: "Everything this phone runs, how each last went, and what needs you.",
  },
  phone: {
    id: "phone",
    title: "This phone",
    tab: "Phone",
    lead: "What this phone keeps, how much room it has left, and copying finished sessions off it.",
  },
  home: {
    id: "home",
    title: "Home",
    tab: "Home",
    lead: "Pairing with home, what you send there, and what you keep there.",
  },
  data: {
    id: "data",
    title: "My data",
    tab: "My data",
    lead: "What you keep, where it is kept, and how it grows.",
  },
  appearance: {
    id: "appearance",
    title: "Appearance",
    tab: "Appearance",
    lead: "The theme.",
  },
  account: {
    id: "account",
    title: "Account",
    tab: "Account",
    lead: "Where your sessions are kept, your sign-in, and your phones.",
  },
}

/** What the build can do, as the desk needs to know it. */
export type DeskBuild = {
  /** The Android app: this phone and its home. */
  readonly phone: boolean
  /** The Pages build: a viewer's, with sample data and no account. */
  readonly viewer: boolean
}

/** The concerns this build's desk offers, in the order it lists them. */
export function concernsHere(
  build: DeskBuild = { phone: hasAudience("apk"), viewer: VIEWER_BUILD }
): ReadonlyArray<Concern> {
  if (build.phone) {
    return [
      CONCERNS.status,
      CONCERNS.phone,
      CONCERNS.home,
      CONCERNS.data,
      CONCERNS.appearance,
    ]
  }
  if (build.viewer) return [CONCERNS.appearance]
  return [CONCERNS.appearance, CONCERNS.account]
}

export const concern = (id: ConcernId): Concern => CONCERNS[id]

/** How many pages have a tab in the phone's bar; More holds the rest. */
const BAR_TABS = 4

/** The phone's bar of pages: a tab each for the first, More for the rest. */
export type DeskBar = {
  readonly tabs: ReadonlyArray<Concern>
  readonly more: ReadonlyArray<Concern>
}

/**
 * The desk's bar in this build: the phone's alone, since the desktop web
 * reaches the pages by their cards. Null where there is none.
 */
export function deskBar(
  build: DeskBuild = { phone: hasAudience("apk"), viewer: VIEWER_BUILD }
): DeskBar | null {
  if (!build.phone) return null
  const pages = concernsHere(build)
  return { tabs: pages.slice(0, BAR_TABS), more: pages.slice(BAR_TABS) }
}

export const FRONT_DESK_WORDS = {
  title: "Settings",
  lead: "What belongs to no wing, one page each. Study settings are in Practice.",
  /** The bar's own name, for a screen reader. */
  bar: "Settings pages",
  more: "More",
  /** My data before its page is filled (MD2, paulgsc/some-ui#2476). */
  dataEmpty:
    "Nothing is shown here yet. For now, what this phone keeps is on This phone, and what home keeps is on Home.",
  viewerTitle: "Sample data",
  viewer:
    "You're trying my toolkit on sample data. Nothing you do here is kept: a reload starts over. Only I sign in, on my home network, where my own data stays.",
} as const
