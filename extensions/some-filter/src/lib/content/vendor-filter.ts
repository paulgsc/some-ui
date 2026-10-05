/**
 * Detects a `filter: invert(...)` a *vendor page* has applied to `<html>`
 * itself (an "invert colours" toggle some sites ship), which silently
 * defeats every colour this extension injects (#741). `getComputedStyle`
 * reports declared colours, not what is seen through the ancestor filter, so
 * unaccounted for, the classifier reads the page backwards and our dark
 * tokens (canvas and veil) composite back to near-white.
 *
 * Scoped to `invert()` only: the one function that fully reverses rendered
 * colours, used by vendor toggles and our own legacy mode. Compensating
 * other functions would be unverifiable guesswork.
 *
 * Pure math + a single read-only `getComputedStyle` call — no DOM writes.
 */

import type { RGBA } from "./color"

const INVERT_RE = /invert\(\s*([\d.]+)(%?)\s*\)/i

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * Net `invert()` amount (0–1) found in a computed `filter` value, e.g.
 * `"invert(1)"` → 1, `"invert(50%)"` → 0.5, `"none"` / `"blur(2px)"` → 0.
 */
export function parseInvertAmount(filterValue: string): number {
  const match = filterValue.match(INVERT_RE)
  if (match === null) return 0

  const [, raw, pct] = match
  if (raw === undefined) return 0

  const amount = Number.parseFloat(raw) / (pct === "%" ? 100 : 1)
  return Number.isFinite(amount) ? clamp01(amount) : 0
}

/**
 * Detects a vendor-authored `invert()` filter active on `<html>`. Read at
 * call time, since a vendor toggle can flip at any point.
 */
export function detectVendorInvert(): number {
  return parseInvertAmount(getComputedStyle(document.documentElement).filter)
}

/** CSS Filter Effects Level 1's `invert()`: C' = (1 - 2a)C + a. */
function applyInvert(channel: number, amount: number): number {
  return (1 - 2 * amount) * channel + amount
}

/** The inverse of `applyInvert`: what raw channel value, once composited through a still-active `invert(amount)`, renders as `target`. Undefined at amount=0.5 (every input maps to the same output) — falls back to `target` unchanged rather than dividing by zero. */
function counterInvert(target: number, amount: number): number {
  const denom = 1 - 2 * amount
  if (Math.abs(denom) < 1e-6) return target
  return clamp01((target - amount) / denom)
}

/**
 * What color must be *declared* so that, once the browser composites it
 * through a still-active `invert(amount)` filter, a human sees `target`.
 * `amount = 0` is a no-op (nothing to counter).
 */
export function counterInvertColor([r, g, b, a]: RGBA, amount: number): RGBA {
  if (amount === 0) return [r, g, b, a]
  return [
    counterInvert(r, amount),
    counterInvert(g, amount),
    counterInvert(b, amount),
    a,
  ]
}

/**
 * The forward direction of `counterInvertColor`: what a human sees once
 * `declared` is composited through `invert(amount)`. Used to judge existing
 * colours (the classifier's samples), not to compensate injected ones.
 */
export function applyInvertToColor([r, g, b, a]: RGBA, amount: number): RGBA {
  if (amount === 0) return [r, g, b, a]
  return [
    applyInvert(r, amount),
    applyInvert(g, amount),
    applyInvert(b, amount),
    a,
  ]
}
