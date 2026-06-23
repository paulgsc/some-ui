import type { CubeRenderer } from "@conveyor/lib/content/cube-renderer"
import type { CubeTheme, ViewportState } from "@conveyor/types"

/**
 * Storybook-only belt driver.
 *
 * Production motion is owned by ConveyorEngine (one rAF loop, toroidal slide,
 * WASM-scheduled face rotation). The stage/zone stories ship no WASM/scheduler,
 * so this is a faithful, dependency-free stand-in that gives the storied belt
 * the same two motions: a continuous horizontal slide plus a scheduled
 * quarter-turn rotation of every cube. It mutates the renderers through their
 * public surface (setXPosition / applyState) and nothing else.
 *
 * Honours `prefers-reduced-motion`: the belt is laid out statically and the rAF
 * loop never starts. The caller still owns `renderer.dispose()`; this returns a
 * disposer that only cancels the loop.
 */
export type BeltMotionOptions = {
  readonly renderers: ReadonlyArray<CubeRenderer>
  readonly theme: CubeTheme
  /** Centre-to-centre stride between cubes in px (cube width + gap). */
  readonly stride: number
  /** x of the first cube before the belt starts sliding. Default 0. */
  readonly startX?: number
  /** Belt scroll speed in px/sec. Default 42. */
  readonly speedPxPerSec?: number
  /** ms a face holds before the cube rotates a quarter turn. Default 2600. */
  readonly faceHoldMs?: number
  /** Builds the viewport state for a discrete cycle position (0..3). */
  readonly makeState: (cyclePosition: number) => ViewportState
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

export function startBeltMotion(opts: BeltMotionOptions): () => void {
  const { renderers, theme, stride, makeState } = opts
  const startX = opts.startX ?? 0
  const speed = opts.speedPxPerSec ?? 42
  const hold = opts.faceHoldMs ?? 2600
  const count = renderers.length

  // Seed: lay the cubes out in a row, each starting on a different face.
  const facePos = renderers.map((_, i) => i % 4)
  renderers.forEach((r, i) => {
    r.setXPosition(startX + i * stride)
    r.applyState(makeState(facePos[i] ?? 0), theme)
  })

  if (count === 0 || prefersReducedMotion()) {
    return (): void => {}
  }

  const span = count * stride // toroidal wrap length
  let raf = 0
  let last = 0
  let offset = 0
  // Per-cube rotation timers, staggered so cubes rotate independently.
  // Cube i starts (i * hold / count) ms into its own hold cycle so they
  // are evenly spread in time rather than all rotating in lockstep.
  const sinceTicks: Array<number> = Array.from(
    { length: count },
    (_, i) => (i * hold) / count
  )

  const frame = (now: number): void => {
    const dt = last === 0 ? 0 : Math.min(now - last, 100)
    last = now

    offset += (speed * dt) / 1000

    for (let i = 0; i < count; i++) {
      const r = renderers[i]
      if (!r) continue

      const st = (sinceTicks[i] ?? 0) + dt
      sinceTicks[i] = st
      const tick = st >= hold
      if (tick) sinceTicks[i] = st - hold

      // Toroidal position: slide left, wrap one cube off the left edge.
      let x = startX + i * stride - offset
      x = ((x % span) + span) % span
      if (x > span - stride) x -= span
      r.setXPosition(x)

      if (tick) {
        const next = ((facePos[i] ?? 0) + 1) % 4
        facePos[i] = next
        r.applyState(makeState(next), theme)
      }
    }

    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)
  return (): void => cancelAnimationFrame(raf)
}
