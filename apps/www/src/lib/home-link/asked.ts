/**
 * One request through the link, answered or not (LA8): what Studio's feed
 * videos (`./call-videos`) and a template's preview (`./previews`) ask home,
 * each through the link's `keep`, and the most bytes one part of a video
 * asks for.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

import { paired } from "./index"

/** The most bytes of a video one request asks for: about 4 MB. */
export const PART_BYTES = 4 * 1024 * 1024

/** Home's answer, or why there is none; `asked` runs one request into it. */
export type CallAsked =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another run, or the page went: ask again. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

/** Runs one request, never rejecting: answered, or why not. */
export async function asked(
  run: () => Promise<
    { kind: "done"; value: HomeAnswer } | { kind: "stopped" } | null
  >
): Promise<CallAsked> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await run()
    return outcome?.kind === "done"
      ? { kind: "answered", answer: outcome.value }
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}
