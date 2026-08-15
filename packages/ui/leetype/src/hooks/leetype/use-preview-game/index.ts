import { useEffect, useState } from "react"
import {
  loadWasm,
  TypedTypingGame,
} from "@leetype/lib/leetype/leetype-wasm-loader"
import type { Snapshot } from "@leetype/types/leetype"
import { ROLE_TYPEABLE } from "@leetype/types/leetype"

export type PreviewGame = {
  /**
   * What a renderer must draw — the engine's rendered text, not necessarily
   * `code` verbatim. See `Layout.displaySource`: a context span's
   * delimiters are stripped before this is built, so it is this field
   * `roles`/`slotOfDisplay` are indexed against, not the raw `code` prop.
   */
  displaySource: string
  roles: Uint8Array
  slotOfDisplay: Int32Array
  slotStatus: Uint8Array
  visibility: Uint8Array
  snapshot: Snapshot
}

/**
 * A headless run of the real engine, fast-forwarded `typedTokens`
 * keystrokes into `code`.
 *
 * Storybook and demo surfaces need a *plausible* mid-session state without
 * a human at the keyboard. Reconstructing one by hand would mean
 * reimplementing the indentation rule in TypeScript — the exact drift the
 * engine exists to prevent — so this drives the engine instead and reads
 * out what it produced.
 */
export function usePreviewGame(
  code: string,
  typedTokens: number,
  /**
   * Seconds of wall clock to simulate before reading the projections out.
   *
   * The reveal window is a function of time as well as of keystrokes, so a
   * story that wants to show revealed code has to say how long the player
   * has been sitting there — a preview taken at `t = 0` is always fully
   * masked, which is a real state but a dull one.
   */
  idleSeconds = 0
): PreviewGame | null {
  const [preview, setPreview] = useState<PreviewGame | null>(null)

  useEffect(() => {
    const aliveRef = { current: true }

    void (async (): Promise<void> => {
      await loadWasm()
      if (!aliveRef.current) return

      const game = new TypedTypingGame(code)
      try {
        const start = Date.now()
        const now = start + idleSeconds * 1000
        game.start(start)

        const roles = game.roles()
        // Walk the engine's own rendered text, not `code` verbatim: a
        // context span's delimiters are stripped before `roles` is built,
        // so indexing against the raw `code` string instead would
        // misalign at the first one (see `Layout.displaySource`).
        const displaySource = game.layout().displaySource
        const chars = Array.from(displaySource)
        let pressed = 0

        for (
          let index = 0;
          index < chars.length && pressed < typedTokens;
          index++
        ) {
          if (roles[index] !== ROLE_TYPEABLE) continue
          game.press(chars[index] ?? "", now)
          pressed++
        }

        // One tick so the reveal loop has run at `now` even for a story
        // where nothing was typed at all.
        game.tick(now)

        setPreview({
          displaySource,
          roles,
          slotOfDisplay: game.slotOfDisplay(),
          slotStatus: game.slotStatus(),
          visibility: game.visibility(),
          snapshot: game.snapshot(now),
        })
      } finally {
        game.free()
      }
    })()

    return (): void => {
      aliveRef.current = false
    }
  }, [code, typedTokens, idleSeconds])

  return preview
}
