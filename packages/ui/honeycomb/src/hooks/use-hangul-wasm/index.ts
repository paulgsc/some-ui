import { useEffect, useState } from "react"
import { HANGUL_WORD_POOL } from "@honeycomb/data"
import {
  getLastError,
  loadHangulWasm,
} from "@honeycomb/lib/hangul/hangul-wasm-runtime"
import type {
  ChallengeSeed,
  GameConfig,
  GameMode,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"

export type UseHangulGameWasmOptions = {
  /**
   * Read when the page's one engine is first built (loadHangulWasm). The core
   * has no config setter, so a later change, e.g. a new difficulty, does not
   * reach a page whose engine already exists.
   */
  config?: Partial<GameConfig>
  mode: GameMode
  /**
   * Word pool for "vocabulary"/"vocabulary-endless" modes; ignored by every
   * other mode. Defaults to the full seed vocabulary (@honeycomb/data) so
   * callers only need to override it for a curated subset.
   */
  wordPool?: Array<ChallengeSeed>
  /** Opaque session identity, forwarded to loadHangulWasm (see its doc). */
  sessionKey?: string
}

export type UseHangulGameWasmReturn = {
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  gameBridge: WasmGameBridge | null
}

/** What a load was for: a change to any of these is a new load. */
type Settled = {
  mode: GameMode
  sessionKey: string | undefined
  wordPool: Array<ChallengeSeed>
  error: string | null
}

/**
 * Pure domain orchestrator.
 * Isolated from React state updates, making it completely deterministic.
 */
async function loadGameSystem(
  mode: GameMode,
  config?: Partial<GameConfig>,
  wordPool?: Array<ChallengeSeed>,
  sessionKey?: string
): Promise<WasmGameBridge> {
  const instance = await loadHangulWasm(config, mode, wordPool, sessionKey)
  if (!instance) {
    throw new Error(
      getLastError()?.message ?? "Unknown error loading Hangul WASM"
    )
  }
  return instance
}

export function useHangulGameWasm({
  config,
  mode,
  wordPool = HANGUL_WORD_POOL,
  sessionKey,
}: UseHangulGameWasmOptions): UseHangulGameWasmReturn {
  // The last bridge that loaded, kept while a mode/session/pool switch loads.
  const [bridge, setBridge] = useState<WasmGameBridge | null>(null)
  const [settled, setSettled] = useState<Settled | null>(null)

  // A change to mode, sessionKey or wordPool (compared by identity: a caller
  // must not build its pool inline every render) loads again, which resets
  // the engine, score and streak included. `active` is checked after the
  // await, so a superseded load never lands over a newer one.
  useEffect((): (() => void) => {
    let active = true
    loadGameSystem(mode, config, wordPool, sessionKey).then(
      (instance) => {
        if (!active) return
        setBridge(instance)
        setSettled({ mode, sessionKey, wordPool, error: null })
      },
      (err: unknown) => {
        if (!active) return
        const error = err instanceof Error ? err.message : String(err)
        setSettled({ mode, sessionKey, wordPool, error })
      }
    )
    return (): void => {
      active = false
    }
  }, [mode, config, wordPool, sessionKey])

  const isCurrent =
    settled !== null &&
    settled.mode === mode &&
    settled.sessionKey === sessionKey &&
    settled.wordPool === wordPool

  return {
    isLoading: !isCurrent,
    isInitialized: bridge !== null,
    error: isCurrent ? settled.error : null,
    gameBridge: bridge,
  }
}
