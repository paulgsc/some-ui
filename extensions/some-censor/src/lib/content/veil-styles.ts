/**
 * Every class string BOYO can put in the DOM, in one place.
 *
 * ## Why this file is the whole stylesheet
 *
 * `uno.config.ts` scans exactly this module and `styles/content.css` — nothing
 * else. So the emitted stylesheet is, by construction, the set of utilities
 * declared below; a class name written anywhere else is not generated and
 * therefore does nothing. That is deliberate: a positive declaration instead
 * of scanning all of `src` and blocklisting words, and the answer to "what can
 * this extension paint?" is one file long.
 *
 * `dom-handle.ts` consumes these constants and owns the DOM invariants; it does
 * not author class names.
 *
 * ## Sizing is a container query, not a measurement
 *
 * The veil declares itself a container (`@container/boyo`), so every child
 * sizes against the *card's* width rather than the viewport's: the same veil
 * renders inside a 380px home-feed card and a ~170px upcoming-slider tile.
 *
 * The scale is written smallest-first, so the *narrow* case is the default and
 * the roomy cases opt in:
 *
 *   base      — a slider tile or a shorts card. Reduced meta: channel only,
 *               truncated; title clamped to two lines; the tightest type.
 *   `@[220px]` — a normal compact/sidebar card. The duration · date sub-line
 *               appears; title gets a third line.
 *   `@[340px]` — a full home-feed or search card. The original design.
 *
 * Nothing depends on getting the tier right: every text node also carries
 * `truncate` or `line-clamp-*`, and every box carries `min-w-0 max-w-full`, so
 * the failure mode of a mis-tiered card is slightly small type, never content
 * painting outside its box.
 */

import type { HintTone, RailStep } from "@censor/types/states"

// ─────────────────────────────────────────────────────────────────────────────
// The veil
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structure and glass. `.boyo-veil` leads: event delegation finds the veil with
 * `closest(".boyo-veil")` and the e2e suite asserts on it, so the namespace
 * class is load-bearing, not decoration.
 *
 * `group` lets the hint pill react to hover on the veil.
 */
const VEIL_BASE =
  "boyo-veil group @container/boyo " +
  "absolute inset-0 z-2 rounded-[inherit] overflow-hidden " +
  "flex flex-col items-center justify-center " +
  "gap-1 p-1 @[220px]:gap-1.5 @[220px]:p-2 @[340px]:gap-2.5 @[340px]:p-3 " +
  "cursor-pointer pointer-events-auto " +
  "transition duration-300 ease-[var(--boyo-ease)] " +
  "focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-[-3px] " +
  "focus-visible:outline-[rgb(var(--boyo-indigo))]"

/** The occluding glass, for every state that is still hiding the card. */
const VEIL_GLASS =
  "bg-[rgb(var(--boyo-glass)/86%)] backdrop-blur-20px backdrop-saturate-135 " +
  "hover:bg-[rgb(var(--boyo-glass)/80%)] active:bg-[rgb(var(--boyo-glass)/92%)]"

/**
 * Whitelisted: a thin green wash rather than an occluder. The card is meant to
 * be readable, so the veil stops taking clicks and mostly gets out of the way
 * before the entry transitions itself to revealed.
 */
const VEIL_WHITELISTED =
  "bg-[rgb(4_20_10/50%)] backdrop-blur-4px pointer-events-none"

/** Revealed: thaw out, then dom-handle removes the node on animationend. */
const VEIL_REVEALED =
  "animate-[boyo-thaw_0.4s_var(--boyo-ease)_forwards] pointer-events-none"

/** Veil class list for a projected state. */
export const VEIL: Record<"occluding" | "whitelisted" | "revealed", string> = {
  occluding: `${VEIL_BASE} ${VEIL_GLASS}`,
  whitelisted: `${VEIL_BASE} ${VEIL_WHITELISTED}`,
  revealed: `${VEIL_BASE} ${VEIL_GLASS} ${VEIL_REVEALED}`,
}

// ─────────────────────────────────────────────────────────────────────────────
// Hint pill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A real element, not pseudo-element copy: that cannot be sized by a container
 * query on its own host or read by a screen reader. Its copy comes from the
 * FSM projection.
 */
const HINT_BASE =
  "boyo-hint inline-flex items-center shrink-0 max-w-full truncate " +
  "rounded-999px b b-solid font-[var(--boyo-font)] font-500 " +
  "tracking-[0.01em] whitespace-nowrap pointer-events-none " +
  "transition duration-250 ease-[var(--boyo-ease)]"

/** The masked-state call to action: the one piece of copy the user must read. */
const HINT_PROMINENT =
  "text-10px px-2.5 py-1 " +
  "@[220px]:text-11px @[220px]:px-3.5 @[220px]:py-1.5 " +
  "@[340px]:text-13px @[340px]:px-4.5 @[340px]:py-2"

/** Every later hint sits above real content and yields to it. */
const HINT_SUBTLE =
  "text-8px px-2 py-0.5 " +
  "@[220px]:text-9px @[220px]:px-2.5 @[220px]:py-1 " +
  "@[340px]:text-11px @[340px]:px-3.5 @[340px]:py-1"

const HINT_TONE = {
  idle:
    "bg-[rgb(255_255_255/6%)] b-[rgb(255_255_255/12%)] " +
    "text-[rgb(var(--boyo-ink)/90%)] " +
    "shadow-[0_2px_14px_rgb(0_0_0/35%)] " +
    "group-hover:bg-[rgb(255_255_255/10%)] " +
    "group-hover:b-[rgb(255_255_255/20%)]",
  meta:
    "bg-[rgb(var(--boyo-indigo)/12%)] b-[rgb(var(--boyo-indigo)/24%)] " +
    "text-[rgb(var(--boyo-indigo))]",
  title:
    "bg-[rgb(var(--boyo-violet)/12%)] b-[rgb(var(--boyo-violet)/24%)] " +
    "text-[rgb(var(--boyo-violet))]",
  whitelist:
    "bg-[rgb(var(--boyo-mint)/8%)] b-[rgb(var(--boyo-mint)/20%)] " +
    "text-[rgb(var(--boyo-mint)/90%)] " +
    "animate-[boyo-fade_2s_var(--boyo-ease)_1.5s_forwards]",
} as const satisfies Record<HintTone, string>

/** Class list for a hint pill of the given tone. */
export function hintClass(tone: HintTone): string {
  const size = tone === "idle" ? HINT_PROMINENT : HINT_SUBTLE
  return `${HINT_BASE} ${size} ${HINT_TONE[tone]}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress rail
// ─────────────────────────────────────────────────────────────────────────────

/** A real element for the same reasons as the hint. */
const RAIL_BASE =
  "boyo-rail absolute bottom-0 left-0 h-2px rounded-b-[inherit] " +
  "pointer-events-none transition-all duration-400 ease-[var(--boyo-ease)]"

const RAIL_STEP = [
  "w-0",
  "w-1/2 bg-[rgb(var(--boyo-indigo)/80%)]",
  "w-full bg-[linear-gradient(90deg,rgb(var(--boyo-indigo)/80%),rgb(var(--boyo-violet)/95%))]",
] as const satisfies Record<RailStep, string>

export function railClass(step: RailStep): string {
  return `${RAIL_BASE} ${RAIL_STEP[step]}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta chip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `min-w-0` and no `min-width`: any fixed minimum wider than a ~170px slider
 * tile pushes the veil's content box past the card's edge.
 */
const META_BASE =
  "boyo-meta flex flex-col items-center w-full min-w-0 max-w-full " +
  "overflow-hidden rounded-[12px] b b-solid text-center pointer-events-none " +
  "bg-[rgb(var(--boyo-indigo)/10%)] b-[rgb(var(--boyo-indigo)/20%)] " +
  "text-[rgb(var(--boyo-ink)/92%)] font-[var(--boyo-font)] leading-[1.5] " +
  "animate-[boyo-rise_0.35s_var(--boyo-ease)_both]"

/** Meta as the card's main content (meta state). */
const META_ROOMY =
  "gap-0.5 px-2 py-1 text-10px " +
  "@[220px]:gap-1 @[220px]:px-3 @[220px]:py-1.5 @[220px]:text-11px " +
  "@[340px]:px-5 @[340px]:py-3 @[340px]:text-12px"

/** Meta demoted above the title chip (title state) — tighter, never taller. */
const META_COMPACT =
  "gap-0 px-2 py-0.5 text-9px " +
  "@[220px]:px-2.5 @[220px]:py-1 @[220px]:text-10px " +
  "@[340px]:px-3.5 @[340px]:py-1.5 @[340px]:text-11px"

export const META: Record<"roomy" | "compact", string> = {
  roomy: `${META_BASE} ${META_ROOMY}`,
  compact: `${META_BASE} ${META_COMPACT}`,
}

export const META_CHANNEL =
  "boyo-meta-channel w-full min-w-0 truncate font-600 " +
  "text-[rgb(var(--boyo-indigo))] " +
  "text-10px @[220px]:text-11px @[340px]:text-13px"

/**
 * Duration · upload date. Hidden below 220px: the channel is the one piece of
 * meta worth the space in a tile that narrow.
 */
export const META_SUB =
  "boyo-meta-sub w-full min-w-0 truncate " +
  "text-[rgb(var(--boyo-dim)/85%)] " +
  "hidden @[220px]:block text-9px @[340px]:text-11px"

// ─────────────────────────────────────────────────────────────────────────────
// Title chip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `line-clamp` rather than free-flowing text, so a long title in a short tile
 * stays inside the veil. The line budget grows with the card.
 */
const TITLE_BASE =
  "boyo-title-chip w-full min-w-0 max-w-full overflow-hidden " +
  "rounded-[12px] b b-solid text-center break-words pointer-events-none " +
  "font-[var(--boyo-font)] font-500 leading-[1.45] " +
  "animate-[boyo-rise_0.35s_var(--boyo-ease)_both] " +
  "line-clamp-2 @[220px]:line-clamp-3 @[340px]:line-clamp-4 " +
  "px-2 py-1 text-10px " +
  "@[220px]:px-3 @[220px]:py-2 @[220px]:text-11px " +
  "@[340px]:px-5 @[340px]:py-3.5 @[340px]:text-13px"

const TITLE_PLAIN =
  "bg-[rgb(var(--boyo-violet)/12%)] b-[rgb(var(--boyo-violet)/25%)] " +
  "text-[rgb(var(--boyo-ink)/97%)]"

const TITLE_TRANSLATED =
  "bg-[rgb(var(--boyo-mint)/8%)] b-[rgb(var(--boyo-mint)/30%)] " +
  "text-[rgb(var(--boyo-mint)/97%)]"

export const TITLE: Record<"plain" | "translated", string> = {
  plain: `${TITLE_BASE} ${TITLE_PLAIN}`,
  translated: `${TITLE_BASE} ${TITLE_TRANSLATED}`,
}

/** The translated-title language badge. */
export const TITLE_LANG =
  "boyo-title-lang block w-full min-w-0 truncate mt-1 " +
  "uppercase tracking-[0.08em] font-400 " +
  "text-[rgb(var(--boyo-mint)/70%)] text-8px @[340px]:text-10px"
