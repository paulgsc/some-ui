/**
 * Keybinding / command typestate — defined once in commons.
 *
 * Per Charter idiom #3 ("commands are more important than inputs"):
 * hotkey, popup, context menu, and automation all feed a *command id*;
 * handlers stay local to each workspace. This module owns the typestate
 * (binding table type, platform-normalized matcher, input-context guard)
 * and the generic registry glue. It has zero dependency on any workspace's
 * domain types.
 *
 * Model lifted from some-censor/src/lib/content/key-binding.ts.
 * See GOOD_CITIZEN.md § 3.
 */

/** Physical modifier state for a key binding. */
export type ModifierSet = {
  readonly ctrl: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly meta: boolean
}

/**
 * A single key binding entry.
 *
 * `code` uses `KeyboardEvent.code` (e.g. "KeyT", "Period") — layout-stable
 * across keyboard locales and modifier state, unlike `KeyboardEvent.key`.
 */
export type KeyBinding<CmdId extends string = string> = {
  readonly code: string
  readonly modifiers: ModifierSet
  readonly command: CmdId
}

/**
 * Maps command ids to their zero-argument handler functions.
 *
 * Handlers stay local to each workspace; only the id type crosses the
 * commons boundary.
 */
export type CommandRegistry<CmdId extends string = string> = Readonly<
  Partial<Record<CmdId, () => void>>
>

/**
 * Returns `true` when the keyboard event's modifier state matches `m`.
 *
 * Platform normalization: on macOS the Meta key (⌘) fills the `ctrl` slot
 * so a single binding works cross-platform. On all other platforms `ctrlKey`
 * fills the `ctrl` slot.
 *
 * @param isMac Optional override for testing; inferred from `navigator.userAgent` when omitted.
 */
export function modifiersMatch(
  e: KeyboardEvent,
  m: ModifierSet,
  isMac?: boolean
): boolean {
  const mac = isMac ?? navigator.userAgent.includes("Mac")
  const primary = mac ? e.metaKey === m.ctrl : e.ctrlKey === m.ctrl
  const secondary = mac ? e.ctrlKey === m.meta : e.metaKey === m.meta
  return primary && secondary && e.altKey === m.alt && e.shiftKey === m.shift
}

/**
 * Returns `true` when `target` is an editable input context where keyboard
 * shortcuts should be suppressed (INPUT, TEXTAREA, SELECT, contentEditable).
 */
export function isInputContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const { tagName } = target
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true
  }
  return target.isContentEditable
}

/** Removes the event listener installed by {@link attachKeyBindings}. */
export type KeyBindingDisposer = () => void

/**
 * Attaches a capture-phase `keydown` listener that dispatches matching
 * bindings to their registered command handlers.
 *
 * - Uses `AbortController` so the listener is removed cleanly on dispose.
 * - Integrates with `DisposableRegistry` when present (pass the returned
 *   disposer to `registry.add()`), but stands alone without it.
 * - Input contexts (INPUT, TEXTAREA, SELECT, contentEditable) are silently
 *   skipped — shortcuts never fire inside text fields.
 *
 * @returns A disposer that detaches the listener.
 */
export function attachKeyBindings<CmdId extends string>(
  registry: CommandRegistry<CmdId>,
  bindings: ReadonlyArray<KeyBinding<CmdId>>
): KeyBindingDisposer {
  const ac = new AbortController()

  document.addEventListener(
    "keydown",
    (e) => {
      if (isInputContext(e.target)) return

      for (const binding of bindings) {
        if (e.code !== binding.code) continue
        if (!modifiersMatch(e, binding.modifiers)) continue

        e.preventDefault()
        registry[binding.command]?.()
        return
      }
    },
    { capture: true, signal: ac.signal }
  )

  return () => {
    ac.abort()
  }
}
