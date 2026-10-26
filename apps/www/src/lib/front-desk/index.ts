/**
 * The front desk's concerns (`/settings`, `lib/wings`' `FRONT_DESK`): what
 * belongs to no wing, one page each, in the words the desk shows
 * (paulgsc/some-ui#2107, SM1). The desk lists them as cards; each opens its
 * own page, so one page never holds two concerns.
 *
 * Which a build offers follows what it can do: the phone has this phone and
 * home, the web an account, the Pages viewer neither. Study settings are
 * Practice's own (`/practice/settings`), not the desk's.
 *
 * The phone's two pages are "apk" pages, so the build is asked
 * `hasAudience` here, where they are named (A3,
 * packages/some-vite-config/AUDIENCES.md). Otherwise pure: the routes and the
 * desk read it, and its test holds the words.
 */

import { hasAudience } from "@/lib/build-profile"
import { VIEWER_BUILD } from "@/lib/data-mode"

export type ConcernId = "phone" | "home" | "appearance" | "account"

export type Concern = {
  readonly id: ConcernId
  readonly to:
    | "/settings/phone"
    | "/settings/home"
    | "/settings/appearance"
    | "/settings/account"
  readonly title: string
  /** One line: what is behind the card. */
  readonly lead: string
}

const CONCERNS: Readonly<Record<ConcernId, Concern>> = {
  phone: {
    id: "phone",
    to: "/settings/phone",
    title: "This phone",
    lead: "What this phone keeps, how much room it has left, and copying finished sessions off it.",
  },
  home: {
    id: "home",
    to: "/settings/home",
    title: "Home",
    lead: "Pairing with your home server, what you send there, and what you keep there.",
  },
  appearance: {
    id: "appearance",
    to: "/settings/appearance",
    title: "Appearance",
    lead: "The theme.",
  },
  account: {
    id: "account",
    to: "/settings/account",
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
  if (build.phone) return [CONCERNS.phone, CONCERNS.home, CONCERNS.appearance]
  if (build.viewer) return [CONCERNS.appearance]
  return [CONCERNS.appearance, CONCERNS.account]
}

/** The concern a page is, for its heading and lead. */
export const concern = (id: ConcernId): Concern => CONCERNS[id]

export const FRONT_DESK_WORDS = {
  title: "Settings",
  back: "Settings",
  lead: "What belongs to no wing, one page each. Study settings are in Practice.",
  viewerTitle: "Sample data",
  viewer:
    "You're trying my toolkit on sample data. Nothing you do here is kept: a reload starts over. Only I sign in, on my home network, where my own data stays.",
} as const
