/**
 * Detects a `filter: invert(...)` a *vendor page* has applied to `<html>`
 * on its own — a real, common pattern (an accessibility "invert colours"
 * toggle some sites ship themselves) that silently defeats every color
 * this extension injects (#741). `getComputedStyle` never reflects
 * `filter` compositing: it reports the literal declared value, not what a
 * human (or a screenshot) actually sees once the browser paints that value
 * through the still-active ancestor filter. Left unaccounted for, this is
 * the root cause behind three of #741's symptoms — the classifier reading
 * a page exactly backwards, and the live pipeline's own dark-theme tokens
 * (both the static canvas and the prepaint veil) compositing back to a
 * bright, near-white result once the vendor's filter is applied on top.
 *
 * Deliberately scoped to `invert()` only — the one filter function both
 * real vendor toggles and this extension's own legacy mode
 * (`theme-apply.ts`'s `applyLegacyFilter`) use to fully reverse a page's
 * rendered colors. Other filter functions (`blur`, `brightness`, …) are
 * out of scope: no known fixture or reported symptom implicates them, and
 * guessing at a compensation for them would be unverifiable.
 *
 * Pure math + a single read-only `getComputedStyle` call — no DOM writes,
 * mirroring `color.ts`'s own read-only discipline.
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
 * Detects a vendor-authored `invert()` filter currently active on
 * `<html>`. Read at call time (not cached) since a vendor's own
 * accessibility toggle can be flipped at any point in a page's lifetime.
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
 * The forward direction of `counterInvertColor`: what a human actually
 * sees once `declared` is composited through a still-active
 * `invert(amount)` filter. Used to judge *existing* declared colors (the
 * classifier's sampled backgrounds) rather than to compensate colors this
 * extension is about to inject.
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
