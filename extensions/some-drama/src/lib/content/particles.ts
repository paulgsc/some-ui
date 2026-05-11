// ── Particles ─────────────────────────────────────────────────────────────────
// Blossom particle system. Single responsibility: spawn + teardown.
//
//   • Layer gets `inset: 0` + explicit 100vw/100vh so absolute children
//     resolve viewport-relative offsets correctly.
//   • Uses programmatic style injection instead of relying on the import
//     pipeline being ready — guarantees the keyframe exists when particles run.
//   • animation-fill-mode intentionally omitted (infinite loops; fill-mode
//     'forwards' would freeze last frame at opacity:0 and hide particles).

import { getOverlayRoot } from "@some-extension/common/lib/layers"

import { el, rnd } from "./utils"

const BLOSSOM_GLYPHS = ["🌸", "🌺", "🌼", "✿", "❀"] as const
const PARTICLE_COUNT = 7

/**
 * Spawn floating blossom particles anchored near `anchorEl`.
 * Returns a teardown function — call it to remove the layer from the DOM.
 */
// particles.ts — updated spawnBlossoms
export function spawnBlossoms(anchorEl: HTMLElement): () => void {
  const root = getOverlayRoot()
  const layer = el("div", "dc-blossom-layer")
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "2147483646",
    overflow: "visible",
  })

  const updateOrigin = (): void => {
    const rect = anchorEl.getBoundingClientRect()
    layer.style.setProperty("--b-ox", `${rect.right}px`)
    layer.style.setProperty("--b-oy", `${rect.top + rect.height / 2}px`)
  }

  updateOrigin()

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const glyph = BLOSSOM_GLYPHS[i % BLOSSOM_GLYPHS.length]
    const b = el("span", "dc-blossom")
    b.textContent = glyph

    // Relative offsets from origin — set via custom props
    const ox = rnd(-20, 40) // offset from anchor right edge
    const oy = rnd(-30, 30) // offset from anchor vertical center
    const tx = rnd(-70, 70)
    const ty = rnd(-110, -35)
    const rot = rnd(-210, 210)
    const dur = rnd(5, 9)
    const delay = rnd(0, 4)

    b.style.setProperty("--b-ox", `${ox}px`)
    b.style.setProperty("--b-oy", `${oy}px`)
    b.style.setProperty("--b-tx", `${tx}px`)
    b.style.setProperty("--b-ty", `${ty}px`)
    b.style.setProperty("--b-rot", `${rot}deg`)
    b.style.setProperty("--b-dur", `${dur}s`)
    b.style.setProperty("--b-delay", `${delay}s`)

    layer.appendChild(b)
  }

  root.appendChild(layer)

  // Poll for position on RAF — cheap, just reads bounding rect
  let rafId: number
  const track = (): void => {
    updateOrigin()
    rafId = requestAnimationFrame(track)
  }
  rafId = requestAnimationFrame(track)

  return (): void => {
    cancelAnimationFrame(rafId)
    layer.remove()
  }
}
