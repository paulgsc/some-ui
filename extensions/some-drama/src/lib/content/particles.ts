// ── Particles ─────────────────────────────────────────────────────────────────
// Blossom particle system. Single responsibility: spawn + teardown.
//
// FIX (vs original):
//   • Layer gets `inset: 0` + explicit 100vw/100vh so absolute children
//     resolve viewport-relative offsets correctly.
//   • Uses programmatic style injection instead of relying on the import
//     pipeline being ready — guarantees the keyframe exists when particles run.
//   • animation-fill-mode intentionally omitted (infinite loops; fill-mode
//     'forwards' would freeze last frame at opacity:0 and hide particles).

import { el, rnd } from "./utils"

const BLOSSOM_GLYPHS = ["🌸", "🌺", "🌼", "✿", "❀"] as const
const PARTICLE_COUNT = 7

/**
 * Spawn floating blossom particles anchored near `anchorEl`.
 * Returns a teardown function — call it to remove the layer from the DOM.
 */
export function spawnBlossoms(anchorEl: HTMLElement): () => void {
  const layer = el("div", "dc-blossom-layer")

  // Ensure the layer covers the full viewport so absolute children
  // can be positioned by viewport coordinates correctly.
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "2147483646",
    overflow: "visible",
  })

  const rect = anchorEl.getBoundingClientRect()

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const glyph = BLOSSOM_GLYPHS[i % BLOSSOM_GLYPHS.length]
    const b = el("span", "dc-blossom")
    b.textContent = glyph

    // Spawn position — scattered around the widget
    const startX = rect.right - rnd(20, rect.width + 40)
    const startY = rect.top + rnd(0, rect.height)

    // Flight vector
    const tx = rnd(-70, 70)
    const ty = rnd(-110, -35)
    const rot = rnd(-210, 210)
    const dur = rnd(5, 9)
    // Stagger so they don't all appear at once
    const delay = rnd(0, 4)

    b.style.left = `${startX}px`
    b.style.top = `${startY}px`

    b.style.setProperty("--b-tx", `${tx}px`)
    b.style.setProperty("--b-ty", `${ty}px`)
    b.style.setProperty("--b-rot", `${rot}deg`)
    b.style.setProperty("--b-dur", `${dur}s`)
    b.style.setProperty("--b-delay", `${delay}s`)

    layer.appendChild(b)
  }

  document.body.appendChild(layer)
  return () => layer.remove()
}
