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

import { DEFAULT_THEME, MOODS } from "@drama/logic/content/constants"
import {
  BURST_MAX_S,
  burstFor,
  petalPeak,
  petalsFor,
} from "@drama/logic/content/petals"
import type { Burst, PetalLook, PetalSpec } from "@drama/logic/content/petals"
import type { Disposables } from "@some-extension/common"
import { getOverlayRoot } from "@some-extension/common/lib/layers"

import { el } from "./dom"

export type Blossoms = {
  /** Re-read the anchor's rect — call whenever the card moves or resizes. */
  reposition: () => void
  /** Re-seed the drifting petals for a new mood or rating. */
  restyle: (look: PetalLook) => void
  /** Play one burst from the card; its particles remove themselves. */
  burst: (burst: Burst) => void
  /** Remove the layer and its particles. */
  destroy: () => void
}

function particle(spec: PetalSpec, className: string): HTMLSpanElement {
  const b = el("span", className)
  b.textContent = spec.glyph
  // Per-particle STATIC offset from the layer origin — use --b-px / --b-py
  // so they don't collide with the layer-level tracking vars.
  b.style.setProperty("--b-px", `${spec.px}px`)
  b.style.setProperty("--b-py", `${spec.py}px`)
  b.style.setProperty("--b-tx", `${spec.tx}px`)
  b.style.setProperty("--b-ty", `${spec.ty}px`)
  b.style.setProperty("--b-rot", `${spec.rot}deg`)
  b.style.setProperty("--b-dur", `${spec.dur}s`)
  b.style.setProperty("--b-delay", `${spec.delay}s`)
  return b
}

/**
 * Spawn floating blossom particles anchored to `anchorEl`'s position, dressed
 * for `look`: the mood picks the glyphs, their motion and (via the same
 * --dc-hue / --dc-sat the card uses) their tint; the rating picks how many
 * there are and how bright they get.
 *
 * No per-frame loop: the card only moves when it is dragged, placed or
 * resized, and its owner calls `reposition()` at exactly those moments. The
 * particles' drift is CSS and
 * stops with the layer. Everything here ends with `life` — the card's active
 * scope, since the layer lives outside the card's dormant gate: the layer,
 * and each burst's removal timer.
 */
export function spawnBlossoms(
  anchorEl: HTMLElement,
  life: Disposables,
  look: PetalLook
): Blossoms {
  const root = getOverlayRoot()
  const layer = el("div", "dc-blossom-layer")
  const drifting = el("div", "dc-petals")
  layer.appendChild(drifting)

  /** Update --b-layer-x/y on the layer from the anchor's current rect. */
  const reposition = (): void => {
    const rect = anchorEl.getBoundingClientRect()
    // Anchor near the right-centre of the card for a natural floating effect
    layer.style.setProperty("--b-layer-x", `${rect.right}px`)
    layer.style.setProperty("--b-layer-y", `${rect.top + rect.height / 2}px`)
  }

  const restyle = (next: PetalLook): void => {
    const theme = MOODS.find((m) => m.type === next.mood) ?? DEFAULT_THEME
    layer.dataset.mood = next.mood ?? "none"
    layer.style.setProperty("--dc-hue", String(theme.hue))
    layer.style.setProperty("--dc-sat", String(theme.sat))
    layer.style.setProperty("--b-peak", String(petalPeak(next.rating)))
    drifting.replaceChildren(
      ...petalsFor(next).map((spec) => particle(spec, "dc-blossom"))
    )
  }

  const burst = (next: Burst): void => {
    const particles = burstFor(next).map((spec) =>
      particle(spec, "dc-blossom dc-blossom-burst")
    )
    layer.append(...particles)
    life.timeout(() => {
      for (const b of particles) b.remove()
    }, BURST_MAX_S * 1000)
  }

  reposition()
  restyle(look)
  root.appendChild(layer)

  const destroy = (): void => layer.remove()
  life.add(destroy)

  return { reposition, restyle, burst, destroy }
}
