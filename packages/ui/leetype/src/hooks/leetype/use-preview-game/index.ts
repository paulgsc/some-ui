import { useEffect, useState } from "react"
import {
  loadWasm,
  TypedTypingGame,
} from "@leetype/lib/leetype/leetype-wasm-loader"
import type { Snapshot } from "@leetype/types/leetype"
import { ROLE_TYPEABLE } from "@leetype/types/leetype"

export type PreviewGame = {
  roles: Uint8Array
  slotOfDisplay: Int32Array
  slotStatus: Uint8Array
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
  typedTokens: number
): PreviewGame | null {
  const [preview, setPreview] = useState<PreviewGame | null>(null)

  useEffect(() => {
    const aliveRef = { current: true }

    void (async (): Promise<void> => {
      await loadWasm()
      if (!aliveRef.current) return

      const game = new TypedTypingGame(code)
      try {
        const now = Date.now()
        game.start(now)

        const roles = game.roles()
        const chars = Array.from(code)
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

        setPreview({
          roles,
          slotOfDisplay: game.slotOfDisplay(),
          slotStatus: game.slotStatus(),
          snapshot: game.snapshot(now),
        })
      } finally {
        game.free()
      }
    })()

    return (): void => {
      aliveRef.current = false
    }
  }, [code, typedTokens])

  return preview
}
