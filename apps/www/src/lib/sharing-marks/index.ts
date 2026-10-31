/**
 * The sharing mark's two axes (#2148), as words and orders: where a record
 * is kept, and how its last exchange with home went, each a mark of its own
 * (`components/sharing-marks`), which no two states of a lane share
 * (`lib/home-link/__tests__/words.test.ts`, the glyph's own test).
 *
 * It sits outside `lib/home-link`, which only the screens LA8 names may
 * import, as `lib/journey` does: these are words and pictures, and reach
 * nothing, so the status page can draw them too. `laneView` decides which
 * mark a lane shows.
 */
export const WHERE_ORDER = ["checking", "phone", "partly", "kept"] as const

export type Where = (typeof WHERE_ORDER)[number]

export const HOW_ORDER = [
  "current",
  "waiting",
  "sending",
  "no-answer",
  "busy",
  "forgotten",
  "unpaired",
  "full",
  "no-room",
  "refused",
  "fault",
  "failed",
] as const

export type How = (typeof HOW_ORDER)[number]

/** What each mark means, as the sheet's legend says it. */
export const MARK_WORDS = {
  title: "What the marks mean",
  where: {
    checking: "Checking where it is kept",
    phone: "Kept on this phone alone",
    partly:
      "Some of it on home; new ones stay on this phone until it is paired again",
    kept: "Kept on home: new ones go there",
  } satisfies Record<Where, string>,
  how: {
    current: "Home has all of it",
    waiting: "Some waits on this phone, and goes next time",
    sending: "Going to home now",
    "no-answer": "Home didn't answer",
    busy: "Home was busy",
    forgotten: "Home no longer knows this phone: pair it again",
    unpaired: "This phone isn't paired with home",
    full: "Home's shelf is full",
    "no-room": "This phone has no room for copies home doesn't have yet",
    refused: "Home didn't take some of it",
    fault: "Something on this phone went wrong",
    failed: "Something went wrong on the way to home",
  } satisfies Record<How, string>,
} as const
