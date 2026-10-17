import type { FileRoutesByTo } from "@/routeTree.gen"

import { hasAudience } from "@/lib/build-profile"

/**
 * Wings: what someone came in for. Build audiences separate the app by
 * device (where it runs); wings separate it by visit, so a wing shows its own
 * rooms and nothing of another's. Once you are in Practice, aph is not on the
 * screen; once you are in Self, studying is not.
 *
 * Every route belongs to exactly one room, to the foyer (where a wing is
 * chosen), or to the front desk (what belongs to no visit: the account, this
 * device, the theme). `routes/__tests__/wings.test.ts` checks that over the
 * real route tree, so a route added later fails until it is placed.
 *
 * "Wing", not "door": a door is already the web surface's door (invariant A4,
 * packages/some-vite-config/AUDIENCES.md). Sensitivity is not a wing either;
 * it is a property of the data, whichever wing shows it.
 */

type Path = keyof FileRoutesByTo

export type WingId = "practice" | "self" | "studio" | "operate" | "public"

export type Wing = {
  id: WingId
  /** What the foyer and the launcher icon call it. */
  name: string
  /** One line: what you come in here for. No status, no counts (see the foyer). */
  job: string
  /** The wing's own Home on the phone, or null where the phone has none. */
  home: Path | null
  /** The wing's own settings, or null when it has none. */
  settings: Path | null
  /**
   * The wing on the desktop web: its Home and what you come in for there,
   * which differ from the phone's (Studio records the Playoff Delta stage on
   * the desktop, voice takes on the phone). Null where the web has none.
   */
  web: { home: Path; job: string; lanOnly?: true } | null
  /**
   * What the wing publishes and what it keeps, as the strip under the web
   * header says it to the owner (CLAUDE.md, "two mandates"). Absent where the
   * web shows no strip.
   */
  exposure?: { published: string; private: string }
}

export type Room = {
  id: string
  wing: WingId
  /** The routes it owns: each one and everything under it ("/" alone is exact). */
  roots: ReadonlyArray<Path>
  /** Its label in its wing's bar on the phone, when it has a tab there. */
  tab?: string
  /** Its label in its wing's sidebar on the desktop web, when it has one there. */
  nav?: string
}

export const WINGS: ReadonlyArray<Wing> = [
  {
    id: "practice",
    name: "Practice",
    job: "Study, reflect, and pick up where you left off",
    home: "/practice",
    settings: "/practice/settings",
    web: {
      home: "/app",
      job: "Study, reflect, and pick up where you left off",
    },
    exposure: {
      published: "these study screens, on Pages",
      private: "your sessions and reflections, which stay yours",
    },
  },
  {
    id: "self",
    name: "Self",
    job: "aph, and what is yours alone",
    home: "/aph",
    settings: "/aph/settings",
    web: null,
  },
  {
    id: "studio",
    name: "Studio",
    job: "Voice takes for the next Build Journal episode",
    home: "/journal",
    settings: null,
    web: {
      home: "/playoff-delta",
      job: "Record what gets published: the Playoff Delta stage",
    },
  },
  {
    id: "operate",
    name: "Operate",
    job: "Lessons and rounds for every learner",
    home: null,
    settings: null,
    web: {
      home: "/lessons",
      job: "Make what gets published: lessons, rounds, the résumé",
      lanOnly: true,
    },
  },
  {
    id: "public",
    name: "Public",
    job: "The published front: what anyone can see",
    home: null,
    settings: null,
    web: null,
  },
]

export const ROOMS: ReadonlyArray<Room> = [
  { id: "practice-home", wing: "practice", roots: ["/practice"], tab: "Home" },
  { id: "dashboard", wing: "practice", roots: ["/app"], nav: "Home" },
  {
    id: "sessions",
    wing: "practice",
    roots: ["/sessions"],
    tab: "Study",
    nav: "Sessions",
  },
  { id: "soundbites", wing: "practice", roots: ["/soundbites"], tab: "Bites" },
  { id: "profile", wing: "practice", roots: ["/profile"], nav: "Profile" },
  { id: "aph", wing: "self", roots: ["/aph"] },
  { id: "journal", wing: "studio", roots: ["/journal"] },
  { id: "playoff-delta", wing: "studio", roots: ["/playoff-delta"] },
  { id: "lessons", wing: "operate", roots: ["/lessons"], nav: "Lessons" },
  { id: "rounds", wing: "operate", roots: ["/rounds"], nav: "Rounds" },
  {
    id: "resume-build",
    wing: "operate",
    roots: ["/resume-build"],
    nav: "Résumé build",
  },
  { id: "landing", wing: "public", roots: ["/", "/mission", "/extensions"] },
  { id: "resume", wing: "public", roots: ["/resume"], nav: "Résumé" },
]

/** Where a wing is chosen: the phone's plain icon opens here. */
export const FOYER = "/foyer" satisfies Path

/** What belongs to no wing: the account, this device, the theme. */
export const FRONT_DESK: ReadonlyArray<Path> = ["/settings", "/auth"]

/** Whether `root` owns `pathname`: itself or under it; "/" only itself. */
export function owns(root: string, pathname: string): boolean {
  if (root === "/") return pathname === "/"
  return pathname === root || pathname.startsWith(`${root}/`)
}

/** The room `pathname` is in, or undefined (the foyer, the front desk). */
function roomOf(pathname: string): Room | undefined {
  return ROOMS.find((room) => room.roots.some((root) => owns(root, pathname)))
}

/** The wing `pathname` is in, or undefined outside every wing. */
export function wingOf(pathname: string): Wing | undefined {
  const room = roomOf(pathname)
  return room && WINGS.find((wing) => wing.id === room.wing)
}

/**
 * A wing's rooms that have a tab, in registry order. Tabs are the phone's bar,
 * whose rooms are "apk" pages, so a build without them has none (A3,
 * packages/some-vite-config/AUDIENCES.md).
 */
export function tabsOf(wing: WingId): ReadonlyArray<Room & { tab: string }> {
  if (!hasAudience("apk")) return []
  return ROOMS.filter(
    (room): room is Room & { tab: string } =>
      room.wing === wing && room.tab !== undefined
  )
}

/**
 * The wings the desktop web's foyer offers in this build: each with a web
 * Home, and the home network's own only where this build carries it (A3,
 * packages/some-vite-config/AUDIENCES.md).
 */
export function webWingsHere(): ReadonlyArray<
  Wing & { web: NonNullable<Wing["web"]> }
> {
  return WINGS.filter(
    (wing): wing is Wing & { web: NonNullable<Wing["web"]> } => onWebHere(wing)
  )
}

/** Whether `wing` has a side on the desktop web in this build (A3). */
function onWebHere(wing: Wing): boolean {
  return wing.web !== null && (wing.web.lanOnly !== true || hasAudience("lan"))
}

/**
 * A wing's rooms in its sidebar on the desktop web, in registry order, and
 * none for a wing this build's web does not carry (A3,
 * packages/some-vite-config/AUDIENCES.md).
 */
export function navOf(wing: Wing): ReadonlyArray<Room & { nav: string }> {
  if (!onWebHere(wing)) return []
  return ROOMS.filter(
    (room): room is Room & { nav: string } =>
      room.wing === wing.id && room.nav !== undefined
  )
}

/** A wing's settings on the desktop web, where it has a web side here. */
export function webSettingsOf(wing: Wing): Path | null {
  return onWebHere(wing) ? wing.settings : null
}
