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
//     --b-layer-x / --b-layer-y  — set on the layer element by reposition();
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

export type Blossoms = {
  /** Re-read the anchor's rect — call whenever the card moves or resizes. */
  reposition: () => void
  /** Remove the layer and its particles. */
  destroy: () => void
}

/**
 * Spawn floating blossom particles anchored to `anchorEl`'s position.
 *
 * No per-frame loop: the card only moves when it is dragged, placed or
 * resized, and its owner calls `reposition()` at exactly those moments. (A
 * requestAnimationFrame loop re-reading the anchor's rect every frame, for as
 * long as the card existed, used to do this.) The particles' drift is CSS and
 * stops with the layer; the owner destroys the layer whenever the card goes
 * dormant, since it lives outside the card's dormant gate.
 */
export function spawnBlossoms(anchorEl: HTMLElement): Blossoms {
  const root = getOverlayRoot()
  const layer = el("div", "dc-blossom-layer")

  /** Update --b-layer-x/y on the layer from the anchor's current rect. */
  const reposition = (): void => {
    const rect = anchorEl.getBoundingClientRect()
    // Anchor near the right-centre of the card for a natural floating effect
    layer.style.setProperty("--b-layer-x", `${rect.right}px`)
    layer.style.setProperty("--b-layer-y", `${rect.top + rect.height / 2}px`)
  }

  reposition()

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

  return {
    reposition,
    destroy: (): void => layer.remove(),
  }
}
