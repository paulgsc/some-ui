/**
 * What home's answer for one clip frame comes to (`lib/home-link/clips`):
 * the frame, ready for an `<img>`; not taken yet (home hasn't made or kept
 * it: a 404); home not answering it this time; or bytes that don't read.
 * Pure, so every answer's reading is tested without a link.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

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
