// ── Commands ──────────────────────────────────────────────────────────────────
// Per Good-Citizen idiom #3 ("commands are more important than inputs"), the
// keybinding typestate — `KeyBinding`, the platform-normalized matcher and the
// input-context guard — lives once in `@some-extension/common`. What stays
// here is drama's own command ids and the bindings that feed them; the
// handlers are wired in content.ts.

import type { KeyBinding } from "@some-extension/common"

/** Command ids owned by some-drama. */
export type DramaCommandId = "toggle-visibility"

/**
 * Single source of truth for drama's keyboard shortcuts.
 *
 * Alt+Shift+D — matched on `KeyboardEvent.code` ("KeyD"), so it holds across
 * keyboard layouts, where the former local handler matched `e.key`.
 */
export const KEY_BINDINGS = [
  {
    code: "KeyD",
    modifiers: { ctrl: false, alt: true, shift: true, meta: false },
    command: "toggle-visibility",
  },
] satisfies ReadonlyArray<KeyBinding<DramaCommandId>>
