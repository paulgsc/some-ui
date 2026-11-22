/**
 * What home's answer for one clip frame comes to (`lib/home-link/clips`):
 * the frame, ready for an `<img>`; not taken yet (home hasn't made or kept
 * it: a 404); home not answering it this time; or bytes that don't read.
 * Pure, so every answer's reading is tested without a link.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"
import type { ClipSide } from "@some-ui/video-render"

/**
 * A frame comes as base64 (the phone's native request carries bytes so), and
 * is shown from a `data:` URL: nothing to let go of when the page goes.
 */
export function readFrame(answer: HomeAnswer): FrameShown {
  if (answer.status === 404) return { kind: "not-taken" }
  // Home busy, failing, or no longer knowing this phone: no frame this time.
  if (answer.status !== 200) return { kind: "away" }
  const base64 = answer.body.replace(/\s/g, "")
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { kind: "unreadable" }
  return { kind: "frame", src: `data:image/png;base64,${base64}` }
}

/** One frame as the clip's page shows it: read, or why home gave none. */
export type FrameShown =
  | { readonly kind: "frame"; readonly src: string }
  /** Home doesn't hold it. */
  | { readonly kind: "not-taken" }
  /** Home sent bytes that don't read as a frame. */
  | { readonly kind: "unreadable" }
  /** This phone isn't paired, so home wasn't asked. */
  | { readonly kind: "unpaired" }
  /** Home didn't answer. */
  | { readonly kind: "away" }
  /** This phone stayed busy with home, so it wasn't asked (#3155). */
  | { readonly kind: "busy" }

/**
 * Whether asking again could change what home answered for a frame of a
 * side `made` so (#2895): a frame is home's for good, and so is one a
 * session took and home didn't keep, since a session's frames are taken
 * once; a walk's frame home may make later, and home away, busy or sending
 * bytes that don't read may answer otherwise next time.
 */
export function settled(shown: FrameShown, made: ClipSide["made"]): boolean {
  switch (shown.kind) {
    case "frame": {
      return true
    }
    case "not-taken": {
      return made === "session"
    }
    case "unreadable":
    case "unpaired":
    case "away":
    case "busy": {
      return false
    }
    default: {
      return assertNever(shown)
    }
  }
}

/** Whether home itself gave this answer, rather than not being reached. */
const fromHome = (shown: FrameShown): boolean =>
  shown.kind === "frame" ||
  shown.kind === "not-taken" ||
  shown.kind === "unreadable"

/**
 * `shown` with frame `at` as this read found it, the others as they were.
 * Home not reached this time (away, busy, this phone unpaired) leaves what
 * home last answered in place, so a frame that showed stays (HS1).
 */
export function placeFrame(
  shown: ReadonlyArray<FrameShown>,
  at: number,
  frame: FrameShown
): ReadonlyArray<FrameShown> {
  const held = shown.at(at)
  if (held !== undefined && fromHome(held) && !fromHome(frame)) return shown
  const next = [...shown]
  next[at] = frame
  return next
}
