/**
 * The front desk's concerns (`/settings`, `lib/wings`' `FRONT_DESK`): what
 * belongs to no wing, one page each (`/settings/<id>`), in the words the desk
 * shows (paulgsc/some-ui#2107, SM1).
 *
 * The phone's three pages are "apk" pages, so the build is asked `hasAudience`
 * here, where they are offered (A3, packages/some-vite-config/AUDIENCES.md).
 */

import { hasAudience } from "@/lib/build-profile"
import { VIEWER_BUILD } from "@/lib/data-mode"

export type ConcernId = "status" | "phone" | "home" | "appearance" | "account"

export type Concern = {
  readonly id: ConcernId
  readonly title: string
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
    lead: "Everything this phone runs, how each last went, and what needs you.",
  },
  phone: {
    id: "phone",
    title: "This phone",
    lead: "What this phone keeps, how much room it has left, and copying finished sessions off it.",
  },
  home: {
    id: "home",
    title: "Home",
    lead: "Pairing with home, what you send there, and what you keep there.",
  },
  appearance: { id: "appearance", title: "Appearance", lead: "The theme." },
  account: {
    id: "account",
    title: "Account",
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
    return [CONCERNS.status, CONCERNS.phone, CONCERNS.home, CONCERNS.appearance]
  }
  if (build.viewer) return [CONCERNS.appearance]
  return [CONCERNS.appearance, CONCERNS.account]
}

export const concern = (id: ConcernId): Concern => CONCERNS[id]

export const FRONT_DESK_WORDS = {
  title: "Settings",
  lead: "What belongs to no wing, one page each. Study settings are in Practice.",
  viewerTitle: "Sample data",
  viewer:
    "You're trying my toolkit on sample data. Nothing you do here is kept: a reload starts over. Only I sign in, on my home network, where my own data stays.",
} as const
