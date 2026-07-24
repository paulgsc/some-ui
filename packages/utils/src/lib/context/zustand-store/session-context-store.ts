import { create } from "zustand"

/**
 * Facts about "what's currently playing, and is it allowed to run right
 * now" - shared across every registry component and the layout editor, so
 * any of them can fold their own reset/suspend behavior into the same flow
 * instead of each one wiring up its own bespoke channel.
 *
 * Deliberately local-only: no connection/streaming state (contrast
 * orchestrator-store.ts's `_commandSender`/`isConnected`/`_streamId`, which
 * assume a server round-trip). This store works standalone in a fully
 * static app; a server integration, if one is ever needed, is a separate
 * adapter that calls these same setters/getters from outside - never
 * something this store's own shape has to assume.
 */
type SessionContextState = {
  /**
   * Opaque identity of whichever session is currently live, or null when
   * nothing is playing. A consumer that holds state which must not bleed
   * across sessions (e.g. a WASM engine's board/stats) diffs this against
   * whatever it last saw.
   */
  sessionKey: string | null
  /**
   * True when something outside a registry's own control currently needs
   * exclusive control (e.g. the layout editor is open). A registry that
   * runs its own clock/loop/input-capture should idle while this is true,
   * the same way it would for its own internal pause.
   */
  suspended: boolean
}

type SessionContextActions = {
  setSessionKey: (key: string | null) => void
  setSuspended: (suspended: boolean) => void
}

const useSessionContextStore = create<
  SessionContextState & SessionContextActions
>((set) => ({
  sessionKey: null,
  suspended: false,
  setSessionKey: (sessionKey): void => set({ sessionKey }),
  setSuspended: (suspended): void => set({ suspended }),
}))

// Plain, framework-agnostic functions - the only surface any adapter (this
// app's own session viewport, or a future server-sync integration) should
// ever need. Safe to call from outside React entirely.
export const setSessionKey = (key: string | null): void =>
  useSessionContextStore.getState().setSessionKey(key)
export const setSuspended = (suspended: boolean): void =>
  useSessionContextStore.getState().setSuspended(suspended)
export const getSessionKey = (): string | null =>
  useSessionContextStore.getState().sessionKey
export const getSuspended = (): boolean =>
  useSessionContextStore.getState().suspended

// React selector hooks - for the layer that owns this store's writes to
// read its own values back reactively. Registries never call these
// directly; they receive the resolved values as plain props instead (see
// OrchestratedYouTubeViewport's `extraProps`).
export const useSessionKey = (): string | null =>
  useSessionContextStore((s) => s.sessionKey)
export const useSuspended = (): boolean =>
  useSessionContextStore((s) => s.suspended)
