/**
 * Censor command + keybinding wiring.
 *
 * Per Good-Citizen idiom #3 ("commands are more important than inputs"), the
 * keybinding/command *typestate* — `ModifierSet`, the code-based `KeyBinding`
 * table type, the platform-normalized matcher, and the input-context guard —
 * lives once in `@some-extension/common`. It was lifted from this workspace's
 * former `key-binding.ts` (see #276/#277), so censor is its first adopter.
 *
 * What stays local here is the *application*: censor's command ids and their
 * handlers. The adapter direction is preserved — this module knows about
 * `VideoManager`; `VideoManager` knows nothing about keybindings.
 */

import type {
  CommandRegistry,
  KeyBinding,
  KeyBindingDisposer,
} from "@some-extension/common"
import { attachKeyBindings as attachCommonKeyBindings } from "@some-extension/common"

import type { VideoManager } from "./video-manager"

/** Command ids owned by some-censor. */
export type CensorCommandId = "advance-all-to-title"

/**
 * Single source of truth for censor's keyboard shortcuts.
 *
 * Default (preserved byte-for-byte from the former local module):
 *   Ctrl+Shift+Period (Windows/Linux) — the commons matcher maps the `ctrl`
 *   slot onto ⌘ on macOS, so one binding works cross-platform.
 */
const KEY_BINDINGS = [
  {
    code: "Period",
    modifiers: {
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
    },
    command: "advance-all-to-title",
  },
] satisfies ReadonlyArray<KeyBinding<CensorCommandId>>

/**
 * Attach censor's keybindings, routing each command id to its local handler.
 *
 * Returns a disposer that detaches the capture-phase listener (see the commons
 * `attachKeyBindings`).
 */
export function attachKeyBindings(mgr: VideoManager): KeyBindingDisposer {
  const registry: CommandRegistry<CensorCommandId> = {
    "advance-all-to-title": () => mgr.advanceAllToTitle(),
  }

  return attachCommonKeyBindings(registry, KEY_BINDINGS)
}
