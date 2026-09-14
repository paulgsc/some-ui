/**
 * SF-RC2 (#1341) — the independent foreground action alphabet the epic
 * (#1338) names: the *realize* half of the second sense→decide→realize
 * sub-pass whose sense/decide halves SF-RC1 (#1340) built in
 * `legibility-audit.ts`. That story deliberately stopped at a diagnostic
 * `data-sw-legibility` attribute and wrote no color, ever; this one adds
 * the repair.
 *
 * Deliberately a module of its own, and a deliberately *separate* action
 * set from `decideLegibility`'s own `TagLegibilityAction[]` rather than an
 * extra member of it:
 *
 *   - The epic's own wording — "an independent foreground action alphabet
 *     (not another overload of `emit-surface-color.textCss`, which only
 *     ever covers the co-located case)". `emit-surface-color` can only
 *     carry a `textCss` for a carrier that *also* owns a parseable
 *     background, which is escape route 1's root cause; this alphabet is
 *     keyed on the audit's own `LegibilityKey` and has no background
 *     precondition at all.
 *   - Keeping `decideLegibility`'s own return value untouched keeps SF-RC1's
 *     diagnostic channel exactly as specified (and its existing e2e specs
 *     asserting whole action arrays — #1358, #1374 — meaningful rather than
 *     rewritten to filter out a new member).
 *
 * The repair never re-derives the violation itself: `decideForegroundRepairs`
 * consumes the same `attrsByKey` `decideLegibility` does and shares its one
 * contrast predicate (`violatesContrast`), so "is this carrier violated" has
 * exactly one answer in this channel, not two that can disagree.
 *
 * Escape routes closed, both confirmed catastrophic against the real built
 * extension by the epic's own Gate-0 recon:
 *
 *   - **Route 1 — no own background** (measured 1.14:1): a carrier with its
 *     own explicit color and no background of its own never entered
 *     `pipeline.ts`'s per-surface hypothesis at all. `auditLegibility`'s
 *     carrier identification has never had a background precondition, so
 *     sensing was already closed by SF-RC1; what was missing was an action
 *     able to repair a carrier the co-located alphabet cannot name.
 *   - **Route 2 — explicit-color-equals-computed-parent** (measured
 *     1.025:1): `ownTextColor`'s inline-`style.color` check (SF-RC1) makes
 *     such a carrier a candidate; this story is what actually repairs it.
 *
 * Known, deliberate residuals (both carried forward from SF-RC1's own
 * disclosure rather than newly introduced here):
 *
 *   - A *stylesheet-rule-based* coincidental match (no inline style; a
 *     class rule sets a color identical to the parent's) is still not
 *     detected as an own declaration, so such a carrier is never a
 *     candidate and is never repaired. #1341 explicitly allows either
 *     closing this with CSSOM rule-matching or accepting it; it is accepted
 *     here. Rule-matching would mean iterating `document.styleSheets` per
 *     round (throwing on every cross-origin sheet, so incomplete anyway)
 *     and `el.matches()`-ing a synthesised selector list per candidate —
 *     materially more machinery, and more failure modes, than the residual
 *     it closes.
 *   - A violation that would need the foreground made *darker* (light text
 *     the extension itself emitted, over a light surface it failed to
 *     darken) is sensed and tagged `data-sw-legibility="violated"` but not
 *     repaired: `repairedForeground` only ever searches
 *     `modifyForegroundColor`'s own light band, which by construction
 *     cannot clear the floor against a light backdrop. Deliberate — both of
 *     the epic's own witnesses, and the incident that prompted it, are
 *     dark-on-dark — and visible rather than silent, since the diagnostic
 *     tag stays. SF-RC5 (#1344) owns reporting that as a contrast-health
 *     signal.
 */

import type { RGBA } from "@filter/lib/content/color"
import {
  FG_LIGHT_MAX,
  hslToRGB,
  modifyForegroundColor,
  rgbaToCss,
  rgbToHSL,
} from "@filter/lib/content/modify-colors"
import { EXT_GUARD } from "@filter/lib/content/theme-apply"

import { isHTMLElementNode } from "./actuator"
import {
  REPAIR_STYLE_ID,
  violatesContrast,
  type LegibilityAttr,
  type LegibilityKey,
} from "./legibility-audit"

/**
 * This channel's own action, in the same shape as `contracts.ts`'s
 * `FilterAction` members (a `kind` plus a key naming *which* carriers, never
 * a physical element — resolving a key back to elements is the Actuator's
 * job, here `realizeForegroundRepairs`) but deliberately outside that union:
 * it never enters the `FilterAction` array `pageAlreadyDark()`/`decide()`
 * consume, which is what keeps rendered-contrast evidence structurally
 * unable to vote on the native-dark verdict (#831's own discipline, canon
 * Remark C.6's "`Φ_comfort` is deliberately not folded into `Φ`").
 */
export type RepairForegroundAction = {
  readonly kind: "repair-foreground"
  readonly key: LegibilityKey
  /** The repaired foreground, already serialized (`rgbaToCss`). */
  readonly css: string
}

/** The extension-owned attribute this channel's emitted rule is keyed on. */
export const REPAIR_ATTR = "data-sw-legibility-fix"

/**
 * How finely `repairedForeground` escalates through the remainder of
 * `modifyForegroundColor`'s band: exactly the granularity 8-bit sRGB can
 * represent, so the search visits every distinct colour the emitted CSS is
 * actually able to express and skips none of them. A coarser step (0.005
 * here originally) can step straight over the true least-luminant clearing
 * value; a finer one would only re-test colours that serialize identically.
 * At most ~72 iterations, once per *distinct key* (not per element), inside
 * a pass that already calls `getComputedStyle` per visited node.
 */
const REPAIR_BAND_STEP = 1 / 255

/**
 * Rounds a candidate to what `rgbaToCss` will actually serialize it as —
 * 8-bit channels, alpha to three decimals — so the colour scored against
 * the contrast floor and the colour written into the emitted rule are the
 * same colour.
 *
 * Scoring full-precision channels and *then* rounding can emit a repair
 * that does not clear the floor it was selected for (bot-found, Codex
 * review round 1: confirmed by direct computation — black over
 * `rgb(55, 55, 55)` picks lightness 0.625 at 4.518:1, which serializes to
 * `rgb(159, 159, 159)` and renders at 4.4976:1, below the floor; quantizing
 * first rejects that candidate and selects `rgb(160, 160, 160)` at 4.552:1
 * instead). Mirrors `rgbaToCss`'s own `to255`/`toFixed(3)` arithmetic
 * exactly rather than approximating it — the two must agree, or this
 * function's whole point is lost.
 */
function quantizeToSerializedColor([r, g, b, a]: RGBA): RGBA {
  const to255 = (v: number): number =>
    Math.round(Math.min(1, Math.max(0, v)) * 255) / 255
  return [to255(r), to255(g), to255(b), Number(a.toFixed(3))]
}

/**
 * The color to repaint a violated carrier's glyphs in: hue- and
 * saturation-preserving, never raw white, and the least luminant value that
 * actually clears `MIN_CONTRAST_RATIO` against the carrier's own resolved
 * backdrop — or `null` when no value in the band clears it, in which case
 * the carrier is left to its authored color and its `violated` diagnostic
 * tag rather than repainted to something that would still be illegible.
 *
 * The search *starts* at `modifyForegroundColor(foreground)`'s own result
 * rather than at the band floor, and only climbs from there. That baseline
 * is exactly what `theme-adapter.ts`'s co-located (#741)
 * `emit-surface-color.textCss` already emits for an equivalent carrier, so
 * in the overwhelmingly common case — a dark authored color over a themed
 * dark surface, where the plain lift already clears comfortably — a carrier
 * repaired by this channel and a carrier fixed by the co-located one land on
 * the *identical* color, and the page keeps one coherent foreground regime
 * instead of two. Starting at the band floor instead would have been
 * marginally "less luminant" while flattening every authored lightness
 * distinction `modifyForegroundColor` exists to preserve ("darker source
 * text → slightly dimmer light text"), for no contrast benefit.
 *
 * Climbing (never descending) from that baseline is what bounds the
 * brightness: the first clearing value wins, so a repair overshoots the
 * floor only by one step, and `FG_LIGHT_MAX` caps it well short of `#fff`
 * even when nothing clears — canon Definition C.3's κ_hi, the "bright white
 * text" failure mode being exactly as unacceptable as the unreadable one.
 *
 * The candidate's own alpha is the authored alpha, preserved — and each
 * candidate is scored through `violatesContrast`, which composites it over
 * the (opaque) backdrop first, so a translucent authored foreground is
 * judged on what it actually renders as. A carrier translucent enough that
 * no lightness in the band can clear the floor (`rgba(…, 0.04)` text) falls
 * out as `null` rather than being silently forced opaque: making
 * deliberately near-invisible text suddenly solid is a bigger, less
 * defensible intervention than this story's own scope, and the diagnostic
 * tag still reports it.
 */
export function repairedForeground(
  foreground: RGBA,
  backdrop: RGBA
): RGBA | null {
  const baseline = quantizeToSerializedColor(modifyForegroundColor(foreground))
  if (!violatesContrast(baseline, backdrop)) return baseline

  const { h, s, l: baselineLightness, a } = rgbToHSL(baseline)
  const span = FG_LIGHT_MAX - baselineLightness
  if (span <= 0) return null

  // Indexed, not accumulated: the final iteration lands on `FG_LIGHT_MAX`
  // exactly, and every step is at most `REPAIR_BAND_STEP` wide. A
  // `l += REPAIR_BAND_STEP` loop guarantees neither, since the baseline is
  // not aligned to the step — it simply stops at whichever value happens to
  // fall short of the ceiling, never testing the ceiling itself, and
  // floating-point accumulation can push the nominal last step past the
  // bound as well (bot-found, Codex review round 1: confirmed by direct
  // computation — black over `rgb(103, 103, 103)` last tested lightness
  // 0.895 at 4.458:1 and gave up, while the band's own ceiling reaches
  // 4.532:1 and would have repaired it).
  const steps = Math.ceil(span / REPAIR_BAND_STEP)
  for (let i = 1; i <= steps; i += 1) {
    const candidate = quantizeToSerializedColor(
      hslToRGB({ h, s, l: baselineLightness + (span * i) / steps, a })
    )
    if (!violatesContrast(candidate, backdrop)) return candidate
  }

  return null
}

/**
 * `decide` for the repair channel — pure, total, no DOM, over exactly the
 * `attrsByKey` `decideLegibility` consumes.
 *
 * Emits nothing for an `"underdetermined"` channel (this module never
 * repaints a carrier whose real foreground or real backdrop the audit could
 * not resolve — a guess is not a repair), nothing for an already-legible
 * key (which is what keeps an unchanged, converged page's realize step a
 * genuine zero-write no-op), and nothing for a violation no in-band color
 * clears.
 *
 * The negative control the epic's own Gate-0 recon established (F-18) needs
 * no special case here and deliberately does not get one: a non-allowlisted
 * descendant with no explicit color of its own is never registered as a
 * carrier by `auditLegibility` at all, and even if it were, inheriting an
 * ancestor's already-correct co-located fix leaves it *legible*, so no
 * violation and no action. Both halves are asserted directly —
 * `__tests__/foreground-repair.test.ts`'s own absence test, and
 * `tests/e2e/specs/issue-1341-sfrc2-foreground-repair.spec.ts` against the
 * real built extension.
 */
export function decideForegroundRepairs(
  attrsByKey: ReadonlyMap<LegibilityKey, LegibilityAttr>
): ReadonlyArray<RepairForegroundAction> {
  const actions: Array<RepairForegroundAction> = []

  for (const [key, attr] of attrsByKey) {
    if (attr.foreground === "underdetermined") continue
    if (attr.backdrop === "underdetermined") continue
    if (!violatesContrast(attr.foreground, attr.backdrop)) continue

    const repaired = repairedForeground(attr.foreground, attr.backdrop)
    if (repaired === null) continue

    actions.push({ kind: "repair-foreground", key, css: rgbaToCss(repaired) })
  }

  return actions
}

/**
 * A `LegibilityKey` is always `rgbaToCss(...)~rgbaToCss(...)` (or the
 * literal `"underdetermined"` on either side) — digits, commas, spaces,
 * dots, parentheses and letters, and structurally incapable of carrying the
 * `"` or `\\` that could break out of the quoted attribute-selector string
 * built below. This guard costs one scan of a ~40-character string per
 * emitted rule and makes that an enforced property of the rule builder
 * rather than an invariant a reader has to go verify in another module.
 */
function isSelectorSafeKey(key: LegibilityKey): boolean {
  return !key.includes('"') && !key.includes("\\")
}

/**
 * Builds the one CSS rule for a single repair action. Extracted, and
 * exported, for the same reason `actuator.ts`'s own `buildSurfaceColorRule`
 * is: a shadow scope cannot be reached by a `<style>` in `document.head` at
 * all (CSS encapsulation), so SF-RC3 (#1342) needs the identical rule text
 * for a per-scope `adoptedStyleSheets` realization.
 *
 * The attribute selector is written *twice*. Both this channel's rule and
 * `buildSurfaceColorRule`'s can match the same carrier — a carrier can own
 * both a background (co-located fix, `[data-sw-patched="…"]` plus
 * `EXT_GUARD`, specificity 0-3-0) and a rendered-contrast violation the
 * co-located fix's own generically-lifted `textCss` did not actually clear —
 * and both declare `color` with `!important`. At equal specificity the
 * cascade would fall through to document order, i.e. to which `<style>`
 * element happens to have been appended to `head` first, which is not
 * something either module controls or should depend on. Repeating the
 * attribute lifts this rule to 0-4-0, so the channel that actually
 * *measured* the rendered result wins deterministically. (`:is()` with a
 * duplicated argument would read better but computes specificity from its
 * most specific argument only — 0-3-0, no bump at all.)
 */
export function buildForegroundRepairRule(
  action: RepairForegroundAction
): string {
  const attr = `[${REPAIR_ATTR}="${action.key}"]`
  return `${attr}${attr}${EXT_GUARD}{color:${action.css}!important}`
}

/**
 * Whether an author-origin `!important` rule — which is all this channel
 * can emit — is actually able to win `color` on this carrier.
 *
 * `buildForegroundRepairRule`'s duplicated attribute selector settles a tie
 * against `buildSurfaceColorRule`, but specificity is only the *last*
 * tiebreak in the cascade, and it cannot beat a declaration that outranks
 * this one earlier: a `style="color: … !important"` attribute is an
 * important author declaration that the spec sorts ahead of any selector-
 * matched one, however specific (bot-found, Codex review round 1). Such a
 * carrier is detected and left untagged rather than tagged with a rule that
 * silently loses — the diagnostic `data-sw-legibility="violated"` still
 * reports it, so the violation stays visible instead of looking repaired.
 *
 * `getPropertyPriority` reads the element's own inline declaration block
 * directly, so this costs no style resolution and — unlike reading back
 * `getComputedStyle` after realization to see whether the rule won — it
 * works identically in jsdom, where no `<style>` rule is applied to
 * `getComputedStyle` at all (confirmed directly: an element matching an
 * `!important` attribute-selector rule still reads back its own inline
 * colour there). It is also a *predicate*, not a post-hoc correction, so a
 * carrier this channel cannot help is never written to and then unwritten.
 *
 * Known residual, the one cascade loss this cannot see: an important author
 * *stylesheet* rule with ID-level specificity (`#id { color: … !important }`)
 * also outranks this rule, and nothing short of CSSOM rule-matching can
 * detect it from the element alone. No amount of extra attribute
 * specificity closes it either — specificity compares ID count first, so a
 * selector carrying one ID beats any number of attribute selectors. The
 * principled fix is a different injection origin entirely (user-origin CSS
 * via `chrome.scripting.insertCSS({ origin: "USER" })`, whose important
 * declarations outrank every author one), which is a materially different
 * mechanism from the `<style>`-element realization this whole codebase is
 * built on — the same boundary ADR 0001's own deferred stylesheet-rule
 * transformation sits behind, and not this story's to cross.
 */
function repairCanWinCascade(el: HTMLElement): boolean {
  return el.style.getPropertyPriority("color") !== "important"
}

function repairStyleEl(): HTMLStyleElement {
  const existing = document.getElementById(REPAIR_STYLE_ID)
  if (existing instanceof HTMLStyleElement) return existing
  const style = document.createElement("style")
  style.id = REPAIR_STYLE_ID
  // Marks this sheet extension-owned for EXT_GUARD, for the Sensor's
  // self-authored-mutation filter, and for pipeline.ts's own
  // withVendorColorsVisible — see theme-apply.ts's createExtensionStyle.
  style.setAttribute("data-my-ext", "")
  document.head.appendChild(style)
  return style
}

/**
 * Realizes `actions` against `root`: tags each named carrier with
 * `data-sw-legibility-fix="<key>"` and rebuilds the one extension-owned
 * `<style>` element whose rules those tags select.
 *
 * Idempotent in both halves, by the same two guards the rest of this
 * codebase already uses for the identical reason (#831 — a write that
 * changes nothing still queues a MutationRecord the Sensor then reacts to,
 * which is how a "rebuild everything each round" actuator turns into a
 * self-sustaining rescan loop): an attribute is written only on a real
 * value change, and the sheet's `textContent` only when the built CSS
 * actually differs.
 *
 * Reconciliation is the mirror of `realizeLegibility`'s own stale-tag
 * clearing, and matters more here than it does there: a stale
 * `data-sw-legibility` is misleading diagnostic data, but a stale
 * `data-sw-legibility-fix` keeps *repainting* a carrier the audit no longer
 * believes needs it. Every currently-tagged element under `root` that this
 * round's actions did not (re)assert loses the attribute, regardless of why
 * it dropped out — repaired-and-now-legible per the authored evidence, no
 * longer a carrier at all, or no longer under a theme. With no rules left,
 * the sheet is removed outright rather than left behind empty.
 *
 * An action whose key resolves to no taggable element emits no rule: a rule
 * nothing can match is dead weight in a sheet the Sensor re-reads, and its
 * absence is also what makes "no carriers" and "no violations" converge on
 * the same zero-write state.
 */
/**
 * Drops every artifact this channel owns, document-wide: the repair sheet
 * and every `data-sw-legibility-fix` tag whose rules it carried.
 *
 * A reconcile round reaching `realizeForegroundRepairs` with no actions
 * already does this, and is the normal path while auto mode is running.
 * Leaving auto mode entirely is not that path — see `pipeline.ts`'s own
 * `clearRealizedColorState`, this function's only caller.
 */
export function clearForegroundRepairs(): void {
  document.getElementById(REPAIR_STYLE_ID)?.remove()
  document.querySelectorAll(`[${REPAIR_ATTR}]`).forEach((el) => {
    el.removeAttribute(REPAIR_ATTR)
  })
}

export function realizeForegroundRepairs(
  root: Element | ShadowRoot,
  actions: ReadonlyArray<RepairForegroundAction>,
  elementsByKey: ReadonlyMap<LegibilityKey, ReadonlyArray<Element>>
): void {
  const keep = new Set<Element>()
  const rules: Array<string> = []

  for (const action of actions) {
    if (!isSelectorSafeKey(action.key)) continue

    let matched = false
    for (const el of elementsByKey.get(action.key) ?? []) {
      if (!isHTMLElementNode(el)) continue
      if (!repairCanWinCascade(el)) continue
      keep.add(el)
      matched = true
      if (el.dataset.swLegibilityFix !== action.key) {
        el.dataset.swLegibilityFix = action.key
      }
    }

    if (matched) rules.push(buildForegroundRepairRule(action))
  }

  root.querySelectorAll(`[${REPAIR_ATTR}]`).forEach((el) => {
    if (!keep.has(el)) el.removeAttribute(REPAIR_ATTR)
  })

  if (rules.length === 0) {
    document.getElementById(REPAIR_STYLE_ID)?.remove()
    return
  }

  const css = rules.join("\n")
  const style = repairStyleEl()
  if (style.textContent !== css) {
    style.textContent = css
  }
}
