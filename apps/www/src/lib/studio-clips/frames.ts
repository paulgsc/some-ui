/**
 * What home's answer for one clip frame comes to (`lib/home-link/clips`):
 * the frame, ready for an `<img>`; not taken yet (home hasn't made or kept
 * it: a 404); or an answer that doesn't read. Pure, so every answer's
 * reading is tested without a link.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

export type FrameRead =
  | { readonly kind: "frame"; readonly src: string }
  | { readonly kind: "not-taken" }
  | { readonly kind: "unreadable" }

/**
 * A frame comes as base64 (the phone's native request carries bytes so), and
 * is shown from a `data:` URL: nothing to let go of when the page goes.
 */
export function readFrame(answer: HomeAnswer): FrameRead {
  if (answer.status === 404) return { kind: "not-taken" }
  const base64 = answer.body.replace(/\s/g, "")
  if (answer.status !== 200 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    return { kind: "unreadable" }
  return { kind: "frame", src: `data:image/png;base64,${base64}` }
}

/** One frame as the clip's page shows it: read, or why home gave none. */
export type FrameShown =
  | FrameRead
  /** This phone isn't paired, so home wasn't asked. */
  | { readonly kind: "unpaired" }
  /** Home didn't answer. */
  | { readonly kind: "away" }
