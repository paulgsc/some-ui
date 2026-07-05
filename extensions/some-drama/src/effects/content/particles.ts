// ── Particles ─────────────────────────────────────────────────────────────────
// Blossom particle system. Single responsibility: spawn + teardown.
//
// PATCH #1 FIX — blossom following the card:
//   The original code used --b-ox / --b-oy for BOTH the layer-level origin
//   (updated by the RAF loop) AND per-particle relative offsets (set as inline
//   styles). Because CSS custom properties inherit, the per-particle inline
//   values silently clobbered the layer's tracked origin in the cascade, so
//   every particle was anchored to (0,0) regardless of card position.
//
//   Fix: two distinct namespaces.
//     --b-layer-x / --b-layer-y  — set on the layer element by the RAF loop;
//                                   track the card's current viewport position.
//     --b-px / --b-py            — set per-particle inline; static relative
//                                   offset from the layer origin.
//   particles.css combines them:  left: calc(var(--b-layer-x) + var(--b-px))
//
//   Particles use `position: fixed` (not `absolute`) so their left/top resolve
//   against the viewport directly — no intermediate offset parent confusion.

import { rnd } from "@drama/logic/content/utils"
import { getOverlayRoot } from "@some-extension/common/lib/layers"

import { el } from "./dom"

const BLOSSOM_GLYPHS = ["🌸", "🌺", "🌼", "✿", "❀"] as const
const PARTICLE_COUNT = 7

/**
 * Spawn floating blossom particles that track `anchorEl`'s position.
 * Returns a teardown function — call it to remove the layer and stop the RAF.
 */
export function spawnBlossoms(anchorEl: HTMLElement): () => void {
  const root = getOverlayRoot()
  const layer = el("div", "dc-blossom-layer")

  /** Update --b-layer-x/y on the layer from the anchor's current rect. */
  const updateOrigin = (): void => {
    const rect = anchorEl.getBoundingClientRect()
    // Anchor near the right-centre of the card for a natural floating effect
    layer.style.setProperty("--b-layer-x", `${rect.right}px`)
    layer.style.setProperty("--b-layer-y", `${rect.top + rect.height / 2}px`)
  }

  updateOrigin()

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const glyph = BLOSSOM_GLYPHS[i % BLOSSOM_GLYPHS.length]!
    const b = el("span", "dc-blossom")
    b.textContent = glyph

    // Per-particle STATIC offset from the layer origin — use --b-px / --b-py
    // so they don't collide with the layer-level tracking vars.
    const px = rnd(-20, 40) // horizontal scatter around anchor right edge
    const py = rnd(-30, 30) // vertical scatter around anchor centre
    const tx = rnd(-70, 70) // drift X over lifetime
    const ty = rnd(-110, -35) // drift Y (upward)
    const rot = rnd(-210, 210)
    const dur = rnd(5, 9)
    const delay = rnd(0, 4)

    b.style.setProperty("--b-px", `${px}px`)
    b.style.setProperty("--b-py", `${py}px`)
    b.style.setProperty("--b-tx", `${tx}px`)
    b.style.setProperty("--b-ty", `${ty}px`)
    b.style.setProperty("--b-rot", `${rot}deg`)
    b.style.setProperty("--b-dur", `${dur}s`)
    b.style.setProperty("--b-delay", `${delay}s`)

    layer.appendChild(b)
  }

  root.appendChild(layer)

  // RAF loop: re-read anchor rect each frame and push to --b-layer-x/y.
  // Cheap — just two getBoundingClientRect reads + two setProperty calls.
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
