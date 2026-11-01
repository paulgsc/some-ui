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

/** Said when the phone would not store what a row's step changed. */
export const REFLECTION_REFUSED = {
  setAside:
    "This phone couldn't set that one aside, so it is still this session's. Try again.",
  supersede:
    "This phone kept the new one but couldn't move the earlier one out of view, so both are this session's. Let one go to set it aside.",
} as const
