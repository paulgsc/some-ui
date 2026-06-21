/**
 *
 * Adapter pattern: this module knows about VideoManager but VideoManager knows
 * nothing about this module.
 */

import type { VideoManager } from "./video-manager"

// --------- Action handlers (single source of truth) ---------------

const ACTIONI_HANDLERS = {
  ADVANCE_ALL_TO_TITLE: (mgr: VideoManager) => mgr.advanceAllToTitle(),
} as const

type KeyAction = keyof typeof ACTIONI_HANDLERS

// -------- Binding table ----------

type ModifierSet = {
  readonly ctrl: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly meta: boolean
}

type KeyBinding = {
  /**
   * Physical keyboard key.
   * Uses KeyboardEvent.code instead of KeyboardEvent.key so bindings remain
   * stable across keyboard layouts and modifier state.
   *
   * Examples:
   *  KeyT
   *  KeyG
   *  Slash
   *  Period
   */
  readonly code: string

  readonly modifiers: ModifierSet
  readonly action: KeyAction
}

/**
 * Single source of truth for all keyboard shortcuts.
 *
 * Default:
 *   Ctr+Shift+V (Windows/Linux)
 *
 *
 * The runtime normalizes ctrl/meta matching so one binding works across
 * platforms.
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
    action: "ADVANCE_ALL_TO_TITLE",
  },
] satisfies ReadonlyArray<KeyBinding>

// --------- Matching helpers ----------

function modifiersMatch(e: KeyboardEvent, modifiers: ModifierSet): boolean {
  const platformPrimary = navigator.userAgent.includes("Mac")
    ? e.metaKey === modifiers.ctrl
    : e.ctrlKey === modifiers.ctrl

  return (
    platformPrimary &&
    e.altKey === modifiers.alt &&
    e.shiftKey === modifiers.shift
  )
}

function isInputContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tag = target.tagName

  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true
  }

  return target.isContentEditable
}

// ----- Public API -----

export type KeyBindingDispose = () => void

export function attachKeyBindings(mgr: VideoManager): KeyBindingDispose {
  const ac = new AbortController()

  document.addEventListener(
    "keydown",
    (e) => {
      if (isInputContext(e.target)) return

      for (const binding of KEY_BINDINGS) {
        const matchesCode = e.code === binding.code
        const matchesModifiers = modifiersMatch(e, binding.modifiers)

        if (!matchesCode || !matchesModifiers) continue

        e.preventDefault()

        ACTIONI_HANDLERS[binding.action](mgr)

        return
      }
    },
    {
      capture: true,
      signal: ac.signal,
    }
  )

  return () => {
    ac.abort()
  }
}
