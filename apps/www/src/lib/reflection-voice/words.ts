/**
 * Spoken reflections' words beside the take pattern's (`TAKE_WORDS`): where
 * their store says more than the pattern's table can. One table, in the
 * person's terms.
 */
import type { TakeWords } from "@some-ui/voice-capture"
import { TAKE_WORDS } from "@some-ui/voice-capture"

/**
 * The pattern's, with a full phone's way to make room: Let it go sets a
 * spoken one aside, kept (D3), so only typing, or letting a session's
 * reflections go from Reflections on the Sessions page, does.
 */
export const REFLECTION_TAKE_WORDS: TakeWords = {
  ...TAKE_WORDS,
  ended: {
    ...TAKE_WORDS.ended,
    full: "No room on this phone for another spoken one. Type it instead, or let some go under Reflections on the Sessions page.",
  },
}

/**
 * Said when the phone kept a Redo's take but would not store the earlier one
 * moved out of view. A Let go the phone won't store is the pattern's to
 * unsay (`setAsideFailed`); a refused Redo has no such path, since the take
 * itself was kept.
 */
export const REDO_REFUSED =
  "This phone kept the new one but couldn't move the earlier one out of view, so both are this session's. Let one go to set it aside."
