// ── Commands ──────────────────────────────────────────────────────────────────
// Per Good-Citizen idiom #3 ("commands are more important than inputs"), the
// keybinding typestate — `KeyBinding`, the platform-normalized matcher and the
// input-context guard — lives once in `@some-extension/common`. What stays
// here is drama's own command ids and the bindings that feed them; the
// handlers are wired in content.ts.

import { MOODS } from "@drama/logic/content/constants"
import type { MoodType } from "@drama/types"
import type { KeyBinding } from "@some-extension/common"

/** Command ids owned by some-drama. */
export type DramaCommandId =
  | "toggle-visibility"
  | `beat:${MoodType}`
  | "rating:up"
  | "rating:down"
  | "finish:up"
  | "finish:down"

const ALT_SHIFT = { ctrl: false, alt: true, shift: true, meta: false } as const

/**
 * Single source of truth for drama's keyboard shortcuts. Matched on
 * `KeyboardEvent.code`, so they hold across keyboard layouts.
 *
 *   Alt+Shift+D      toggle the card
 *   Alt+Shift+1..6   log a beat, in MOODS order (joy, love, sad, tension,
 *                    cringe, meh); press again within 2s to escalate it
 *   Alt+Shift+= / -  rating up / down half a point (of 10)
 *   Alt+Shift+] / [  likelihood to finish up / down 10%
 */
export const KEY_BINDINGS: ReadonlyArray<KeyBinding<DramaCommandId>> = [
  { code: "KeyD", modifiers: ALT_SHIFT, command: "toggle-visibility" },
  ...MOODS.map(
    (m, i): KeyBinding<DramaCommandId> => ({
      code: `Digit${i + 1}`,
      modifiers: ALT_SHIFT,
      command: `beat:${m.type}`,
    })
  ),
  { code: "Equal", modifiers: ALT_SHIFT, command: "rating:up" },
  { code: "Minus", modifiers: ALT_SHIFT, command: "rating:down" },
  { code: "BracketRight", modifiers: ALT_SHIFT, command: "finish:up" },
  { code: "BracketLeft", modifiers: ALT_SHIFT, command: "finish:down" },
]
