import { create } from "zustand"

/**
 * "What is playing, and may it run now", shared by every registry component
 * and the layout editor so each folds its reset/suspend behavior into one
 * flow. Deliberately local-only (unlike orchestrator-store.ts): a server
 * integration would be an adapter calling these setters from outside.
 */
type SessionContextState = {
  /**
   * Opaque identity of the live session, or null. A consumer whose state must
   * not bleed across sessions (a WASM engine's board) diffs this.
   */
  sessionKey: string | null
  /**
   * Something outside the registry needs exclusive control (the layout editor
   * is open). A registry with its own clock, loop or input capture idles.
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

// The only surface an adapter needs; safe to call outside React.
export const setSessionKey = (key: string | null): void =>
  useSessionContextStore.getState().setSessionKey(key)
export const setSuspended = (suspended: boolean): void =>
  useSessionContextStore.getState().setSuspended(suspended)

// For the layer that owns the writes. Registries get these values as props
// instead (see OrchestratedYouTubeViewport's `extraProps`).

export const useSessionKey = (): string | null =>
  useSessionContextStore((s) => s.sessionKey)
export const useSuspended = (): boolean =>
  useSessionContextStore((s) => s.suspended)
