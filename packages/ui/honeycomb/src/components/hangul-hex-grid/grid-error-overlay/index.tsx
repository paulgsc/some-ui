import type { JSX } from "react"

type GridErrorOverlayProps = {
  error: string | null
}

/**
 * Shown when the honeycomb grid's own hex-geometry WASM module (a separate
 * concern from the game engine's WASM module - see HexGrid's onStatusChange)
 * fails to load: the grid itself renders its own inline error in its place,
 * but nothing outside it would otherwise know gameplay should stop too.
 * Unlike PauseOverlay, this is not user-dismissable - there is nothing to
 * "resume" until the underlying load failure resolves on its own (e.g. a
 * viewport/prop change that re-triggers HexGrid's regenerate()).
 */
export const GridErrorOverlay = ({
  error,
}: GridErrorOverlayProps): JSX.Element | null => {
  if (!error) return null

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40"
      role="alert"
    >
      <div className="glass-effect rounded-3xl px-12 py-8 text-white text-center max-w-md">
        <div className="text-2xl font-bold mb-4 text-red-400">
          ⚠️ Grid unavailable
        </div>
        <div className="text-white/70 mb-2">{error}</div>
        <div className="text-sm text-white/50">
          Gameplay is paused - nothing is being scored or spawned right now.
        </div>
      </div>
    </div>
  )
}
