/**
 * The canonical catalogue of YouTube card elements that BOYO tracks.
 *
 * Shared between observer.ts, video-manager.ts, events.ts and — via
 * `PREMASK_SELECTORS` — the static occluder rules in `styles/content.css`,
 * which are the only thing hiding a card between paint and the content
 * script taking ownership. If the two lists disagree, a card type only in the
 * CSS is blurred forever, and one only here flashes its thumbnail before the
 * veil mounts. `selectors.test.ts` asserts the stylesheet derives from this
 * file.
 *
 * ## Two families, and why one of them needs a guard
 *
 * Most `ytd-*-renderer` custom elements are YouTube's Polymer generation of a
 * *video* card: `ytd-video-renderer`, `ytd-grid-video-renderer` and friends
 * each mean exactly one thing, and every instance of one is a video, so
 * matching the tag is sufficient.
 *
 * The other family is *polymorphic*: the same tag renders non-video content
 * too, distinguished only by what is inside it.
 *
 *   - `yt-lockup-view-model` is the Lit-era card, and it renders a video, a
 *     playlist, a channel, a podcast, or a "collection" shelf tile.
 *   - `ytd-rich-item-renderer` is Polymer, but it is the home feed's *generic
 *     grid cell*: it wraps a video, an ad slot (`ytd-ad-slot-renderer`), a
 *     Shorts shelf, a community post or a playlist tile (`[ORP1]`).
 *
 * Adding a polymorphic tag bare is wrong: an element that can never produce a
 * videoId is occluded by the pre-mask rule with nothing coming to lift it (a
 * permanently blurred, unclickable tile), and it keeps the retry loop alive.
 *
 * So the polymorphic tags carry `requiresVideoLink`: such an element counts as
 * a card only once it contains a watch or shorts href — `:has()` in the
 * stylesheet, {@link isVideoCard} in TypeScript, so the two layers agree on
 * what a card is.
 */

/** A tracked card element type. */
export type CardSelector = {
  /** Custom-element tag name. */
  readonly tag: string
  /**
   * `true` for polymorphic tags that also render non-video content. Such an
   * element is only treated as a card once it contains a video link — and,
   * because a link somewhere in the subtree is necessary but not sufficient,
   * only while it does not *contain* another catalogue card. A cell wrapping
   * a lockup, or a shelf wrapping a row of them, holds plenty of video links
   * and is not itself a video (see {@link classifyCard}).
   */
  readonly requiresVideoLink: boolean
  /**
   * `true` when the pre-mask stylesheet must keep occluding this tag
   * unconditionally on an engine that cannot parse the `:has()` guard
   * (Firefox 112–120, per the baseline note in `styles/content.css`).
   *
   * Only `ytd-rich-item-renderer` carries this: it is the home feed's primary
   * cell, and losing its floor on a declared-supported engine would fail the
   * whole surface open. The price there is that a non-video cell stays
   * blurred, the fail-closed direction. The Lit-era lockups deliberately do
   * not: unguarded, they occlude channel and playlist tiles that nothing could
   * ever release (L2).
   */
  readonly unguardedFallback?: boolean
}

/** Anchor shapes that identify an element as pointing at a watchable video. */
export const VIDEO_LINK_SELECTOR = 'a[href*="/watch"], a[href*="/shorts/"]'

export const CARD_SELECTORS: ReadonlyArray<CardSelector> = [
  // ── Polymer video renderers: tag alone is decisive ───────────────────────
  { tag: "ytd-video-renderer", requiresVideoLink: false },
  { tag: "ytd-grid-video-renderer", requiresVideoLink: false },
  { tag: "ytd-compact-video-renderer", requiresVideoLink: false },
  { tag: "ytd-playlist-panel-video-renderer", requiresVideoLink: false },
  // Playlist pages: rows are their own renderer, not covered by the four above.
  { tag: "ytd-playlist-video-renderer", requiresVideoLink: false },
  // Legacy shorts shelf item.
  { tag: "ytd-reel-item-renderer", requiresVideoLink: false },

  // ── Polymorphic tags: need the video-link guard ──────────────────────────
  // The home feed's generic grid cell (Polymer). Wraps videos, but also ad
  // slots, Shorts shelves, posts and playlist tiles — see the header.
  {
    tag: "ytd-rich-item-renderer",
    requiresVideoLink: true,
    unguardedFallback: true,
  },
  // The unified Lit-era card behind the upcoming-feed slider, watch-next and
  // search.
  { tag: "yt-lockup-view-model", requiresVideoLink: true },
  // Shorts shelves. Two tags because YouTube ships both revisions concurrently.
  { tag: "ytm-shorts-lockup-view-model", requiresVideoLink: true },
  { tag: "ytm-shorts-lockup-view-model-v2", requiresVideoLink: true },
  // Video lockups inside a watch page's structured description.
  {
    tag: "ytd-structured-description-video-lockup-renderer",
    requiresVideoLink: true,
  },
]

/** Every tracked tag name, in catalogue order. */
export const VIDEO_SELECTORS: ReadonlyArray<string> = CARD_SELECTORS.map(
  (s) => s.tag
)

/**
 * Selector for `querySelectorAll` / `matches` / `closest`.
 *
 * Deliberately unguarded: it is a cheap superset used to *find* candidates.
 * {@link isVideoCard} applies the guard, so a polymorphic lockup is matched
 * here but rejected before it can enter the manager's registry.
 */
export const SEL = VIDEO_SELECTORS.join(",")

/**
 * The exact selector text each pre-mask rule must use — one entry per tag,
 * one CSS rule per entry.
 *
 * Guarded tags get `:has(<video link>)` so a channel or playlist lockup is
 * never occluded by a rule no content script will ever lift.
 *
 * Each entry is a standalone selector, not one shared comma list (QC0): CSS
 * selector-list invalidation is all-or-nothing, so an engine that cannot parse
 * `:has()` (Firefox 112–120, declared supported) would drop the whole rule,
 * plain tags included. content.css gives each entry its own `{ }` block.
 */
export const PREMASK_SELECTORS: ReadonlyArray<string> = CARD_SELECTORS.map(
  ({ tag, requiresVideoLink }) =>
    requiresVideoLink
      ? `${tag}:has(${VIDEO_LINK_SELECTOR}):not(:has(${SEL}), [data-boyo])`
      : `${tag}:not([data-boyo])`
)

/**
 * The rules an engine that cannot parse `:has()` falls back to — one plain
 * `${tag}:not([data-boyo])` per tag with {@link CardSelector.unguardedFallback}.
 * `content.css` emits them under `@supports not selector(:has(a))`, so on a
 * modern engine they never apply and the guarded rule above is the only one.
 */
export const PREMASK_FALLBACK_SELECTORS: ReadonlyArray<string> =
  CARD_SELECTORS.filter((s) => s.unguardedFallback === true).map(
    ({ tag }) => `${tag}:not([data-boyo])`
  )

/**
 * What the engine rendering `root` can parse, as far as the pre-mask rules
 * care: whether `:has()` is a selector it understands. On an engine that
 * cannot parse it (Firefox 112–120), every guarded rule in `content.css` is
 * dropped whole and only the plain rules plus the `@supports not
 * selector(:has(a))` fallback block apply — so which elements the occluder
 * is hiding depends on the engine, and the census has to know which one it
 * is on.
 */
export type OccluderEngine = {
  /** `true` when `:has()` parses, so the guarded rules are live. */
  readonly hasSelector: boolean
}

/**
 * Probe `root`'s engine for `:has()` support. A read through the node that
 * was handed in, not through a global: on an engine without `:has()` the
 * query throws a `SyntaxError`, which is exactly the condition that drops
 * the stylesheet's guarded rules.
 */
export function detectOccluderEngine(root: ParentNode): OccluderEngine {
  try {
    root.querySelector(":has(a)")
    return { hasSelector: true }
  } catch {
    return { hasSelector: false }
  }
}

/**
 * Every element the static occluder is hiding *right now*, on this engine.
 *
 * With `:has()` available, the condition is the guarded one: a card per
 * {@link classifyCard} — the same three-way condition {@link PREMASK_SELECTORS}
 * spells in CSS — carrying no `data-boyo`. Without it, the guarded rules are
 * gone and the occluder is the plain rules plus the fallback block: every
 * unstamped element of a plain tag, and every unstamped element of a tag
 * with {@link CardSelector.unguardedFallback}, shells and containers
 * included, so the fallback engine's stranded cells reach `OccluderReleases`.
 *
 * Both are the stylesheet's condition in TypeScript rather than a
 * `querySelectorAll` of its selector text: jsdom cannot parse a `:has()`
 * nested inside `:not()`, and a query silently returning nothing would blind
 * `OccluderReleases` under the unit suite. `rich-item-cells.spec.ts` pins the
 * two spellings together on a real engine.
 *
 * `root` is required rather than defaulting to `document`: this is the logic
 * layer (`extension-charter/no-logic-layer-side-effects`). It also lets a test
 * scope the query to a fixture, and `engine` lets it stand on the fallback
 * engine.
 */
export function occludedElements(
  root: ParentNode,
  engine: OccluderEngine = detectOccluderEngine(root)
): Array<HTMLElement> {
  const out: Array<HTMLElement> = []
  for (const el of root.querySelectorAll<HTMLElement>(SEL)) {
    if (el.hasAttribute("data-boyo")) continue
    if (engine.hasSelector) {
      if (classifyCard(el) === "card") out.push(el)
      continue
    }
    const entry = CARD_SELECTORS.find((s) => s.tag === el.tagName.toLowerCase())
    if (entry === undefined) continue
    if (!entry.requiresVideoLink || entry.unguardedFallback === true) {
      out.push(el)
    }
  }
  return out
}

/**
 * What a catalogue element is, right now.
 *
 *   `card`      — a video tile BOYO should own.
 *   `container` — a catalogue tag wrapping *other* catalogue cards: the home
 *                 feed's grid cell around a lockup, or a shelf around
 *                 a row of them. It holds video links, so a link check alone
 *                 would adopt it and mount one veil over everything inside;
 *                 the cards inside are the cards, and this is never one. It
 *                 is not queued and the stylesheet does not occlude it.
 *   `shell`     — a guarded tag with no video link (yet): a channel or
 *                 playlist tile, an ad cell, or a card YouTube has not filled
 *                 in. Queued under the budget in case it hydrates.
 *   `none`      — not a catalogue tag at all.
 *
 * This is the polymorphism guard {@link SEL} omits, applied before adoption so
 * the 500ms retry loop is bounded by real video cards, not every tile YouTube
 * renders (Charter §8). {@link PREMASK_SELECTORS} spells the same condition in
 * CSS.
 */
export type CardKind = "card" | "container" | "shell" | "none"

export function classifyCard(el: HTMLElement): CardKind {
  const tag = el.tagName.toLowerCase()
  const entry = CARD_SELECTORS.find((s) => s.tag === tag)
  if (!entry) return "none"
  if (!entry.requiresVideoLink) return "card"
  if (el.querySelector(SEL) !== null) return "container"
  return el.querySelector(VIDEO_LINK_SELECTOR) !== null ? "card" : "shell"
}

/** Is this element a card BOYO should own? See {@link classifyCard}. */
export function isVideoCard(el: HTMLElement): boolean {
  return classifyCard(el) === "card"
}
