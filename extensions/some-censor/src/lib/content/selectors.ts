/**
 * The canonical catalogue of YouTube card elements that BOYO tracks.
 *
 * Shared between the Sensor and — via
 * `PREMASK_SELECTORS` — the static occluder rules in `styles/content.css`,
 * which are the only thing hiding a card between paint and the content
 * script taking ownership. If the two lists disagree, a card type only in the
 * CSS is blurred forever, and one only here flashes its thumbnail before it is
 * stamped. `selectors.test.ts` asserts the stylesheet derives from this
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
  /**
   * `true` when YouTube renders this tag *around* another catalogue card as
   * well as on its own: the home feed's grid cell, and the outer of the two
   * Shorts revisions, which today wraps the inner one. Unstamped, such an
   * element says nothing about whether a card inside it is still pending, so
   * {@link SHELF_COLLAPSE_SELECTORS} does not count it as one.
   */
  readonly wrapsCards?: boolean
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
    wrapsCards: true,
  },
  // The unified Lit-era card behind the upcoming-feed slider, watch-next and
  // search.
  { tag: "yt-lockup-view-model", requiresVideoLink: true },
  // Shorts shelves. Two tags because YouTube ships both revisions concurrently.
  { tag: "ytm-shorts-lockup-view-model", requiresVideoLink: true },
  {
    tag: "ytm-shorts-lockup-view-model-v2",
    requiresVideoLink: true,
    wrapsCards: true,
  },
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
 * here but rejected before the Sensor adopts it as a card.
 */
export const SEL = VIDEO_SELECTORS.join(",")

/**
 * Set on `<html>` only while the owner has switched the extension off
 * (#1807). Every pre-mask rule is keyed to its absence, so the switch lifts
 * the pre-mask and a content script that never runs leaves it on.
 */
export const SWITCHED_OFF_ATTRIBUTE = "data-boyo-off"

/**
 * The mode's page rules (#1966) on `<html>`: `shown` lets community post
 * images through, and `blank` paints no card the content script has not
 * read yet. Absent, the stylesheet does what Standard does.
 */
export const POSTS_ATTRIBUTE = "data-boyo-posts"
export const LOADING_ATTRIBUTE = "data-boyo-loading"

/** The face control the Actuator puts in a plated page's description (QD13). */
export const FACE_CONTROL_ATTRIBUTE = "data-boyo-face-hold"

const WHILE_ON = `:root:not([${SWITCHED_OFF_ATTRIBUTE}])`

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
      ? `${WHILE_ON} ${tag}:has(${VIDEO_LINK_SELECTOR}):not(:has(${SEL}), [data-boyo])`
      : `${WHILE_ON} ${tag}:not([data-boyo])`
)

/**
 * The rules an engine that cannot parse `:has()` falls back to — one plain
 * `${tag}:not([data-boyo])` per tag with {@link CardSelector.unguardedFallback}.
 * `content.css` emits them under `@supports not selector(:has(a))`, so on a
 * modern engine they never apply and the guarded rule above is the only one.
 */
export const PREMASK_FALLBACK_SELECTORS: ReadonlyArray<string> =
  unguardedFallbackTags().map((tag) => `${WHILE_ON} ${tag}:not([data-boyo])`)

/** The tags with {@link CardSelector.unguardedFallback}, comma-joined. */
export const FALLBACK_TAGS: string = unguardedFallbackTags().join(",")

function unguardedFallbackTags(): ReadonlyArray<string> {
  return CARD_SELECTORS.filter((s) => s.unguardedFallback === true).map(
    ({ tag }) => tag
  )
}

/**
 * A shelf: a row of cards under a header. When every card in it is absent,
 * the header would be left over a gap, the slot QD11 forbids. Each entry is
 * the element that has to go for no header and no gap to remain:
 *
 *   - Home: the grid's section around a `ytd-rich-shelf-renderer`.
 *   - Search: `grid-shelf-view-model` itself. It is one result among the
 *     others in a shared item section, and carries its own margins.
 *   - Channel home: the item section that holds only the shelf. It draws the
 *     separator line, so hiding the shelf alone would leave a doubled one.
 *
 * A shelf in any other container keeps its header.
 */
const SHELF_SELECTORS: ReadonlyArray<string> = [
  "ytd-rich-section-renderer",
  "grid-shelf-view-model",
  "ytd-item-section-renderer:has(> #contents > ytd-reel-shelf-renderer:only-child)",
  "ytd-item-section-renderer:has(> #contents > ytd-shelf-renderer:only-child)",
]

/**
 * The element a shelf holds each tile in, per surface (home, channel,
 * search). A slot whose child is not a catalogue tag holds a tile no content
 * script takes: a post, a channel tile. A home cell that is itself the card
 * is stamped, and its stamp decides instead.
 */
const SHELF_ITEM_SLOTS = [
  "ytd-rich-item-renderer:not([data-boyo]) > #content",
  "yt-horizontal-list-renderer #items",
  ".ytGridShelfViewModelGridShelfItem",
].join(", ")

/**
 * What keeps a shelf on screen: a card that is not absent, whether plated or
 * not adopted yet, or a tile in one of {@link SHELF_ITEM_SLOTS}. An unstamped
 * {@link CardSelector.wrapsCards} tag is left out, because it may only be the
 * wrapper around an absent card. That leaves one early collapse: a wrapper
 * tag that is itself a pending card. It hides, and comes back once plated.
 * And one header over nothing: a home post whose attached video is absent.
 * Its cell is hidden, but the post still holds the shelf, and telling the
 * two apart would need a `:has()` inside a `:has()`.
 */
const SHELF_LIVE_SELECTOR = [
  '[data-boyo]:not([data-boyo="absent"])',
  `:is(${CARD_SELECTORS.filter((s) => s.wrapsCards !== true)
    .map(({ tag }) => tag)
    .join(", ")}):not([data-boyo="absent"])`,
  `:is(${SHELF_ITEM_SLOTS}) > :not(${VIDEO_SELECTORS.join(", ")})`,
].join(", ")

/**
 * The exact selector text of each shelf-collapse rule in `content.css`, one
 * rule per entry for the same reason as {@link PREMASK_SELECTORS}: a shelf
 * that holds an absent card and nothing in {@link SHELF_LIVE_SELECTOR}. On an
 * engine without `:has()` every one of these is dropped, and the header stays.
 */
export const SHELF_COLLAPSE_SELECTORS: ReadonlyArray<string> =
  SHELF_SELECTORS.map(
    (shelf) =>
      `${shelf}:has([data-boyo="absent"]):not(:has(${SHELF_LIVE_SELECTOR}))`
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
 * Every element the static occluder is hiding *right now*, on this engine,
 * while switched on (the runtime is stopped while off).
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
 *                 would adopt it as one card around everything inside;
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
