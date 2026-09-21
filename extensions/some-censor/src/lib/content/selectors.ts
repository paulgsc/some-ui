/**
 * The canonical catalogue of YouTube card elements that BOYO tracks.
 *
 * Shared between observer.ts, video-manager.ts, events.ts and — via
 * `PREMASK_SELECTORS` — the static occluder rules in `styles/content.css`,
 * which are the only thing hiding a card between paint and the content
 * script taking ownership. Those two lists disagreeing is exactly the bug
 * reported in #973:
 * a card type present in the CSS but absent here is blurred forever, and a card
 * type present here but absent from the CSS flashes its thumbnail before the
 * veil mounts. `selectors.test.ts` asserts the stylesheet still derives from
 * this file.
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
 *     playlist, a channel, a podcast, or a "collection" shelf tile. This is
 *     what #973 ran into from the other side — the tag was missing entirely,
 *     so every card in the newer shelves (the upcoming-feed slider, watch-next,
 *     most of search) went unmasked.
 *   - `ytd-rich-item-renderer` is Polymer, but it is the home feed's *generic
 *     grid cell*, not a video renderer: it wraps whatever the feed item is —
 *     a video, an ad slot (`ytd-ad-slot-renderer`), a Shorts shelf, a
 *     community post, a playlist tile. An earlier revision of this file
 *     listed it with the plain tags on the claim that "every instance of it
 *     is a video"; that claim is false, and it is the whole mechanism of
 *     #1422 (`[ORP1]`): the ad cell was occluded by the pre-mask rule, could
 *     never produce a videoId, and so was never released — a permanently
 *     blurred, permanently unclickable tile — while keeping the retry loop
 *     alive for the life of the tab.
 *
 * Adding a polymorphic tag bare over-corrects in exactly that way: an element
 * that can never produce a videoId is occluded by the pre-mask rule with no
 * content script coming to replace that occlusion, and it sits in the
 * manager's unresolved queue keeping the retry loop alive forever.
 *
 * So the polymorphic tags carry `requiresVideoLink`. Such an element counts
 * as a card only once it contains a watch or shorts href — the same
 * condition, expressed as `:has()` in the stylesheet and as
 * {@link isVideoCard} in TypeScript, so the two layers cannot drift into
 * disagreeing about what a card is. The guard is what lets {@link isVideoCard}
 * say "not a card" for the ad cell, which is what lets the manager stop
 * retrying it and what keeps the stylesheet from occluding it in the first
 * place.
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
   * Only the tag that used to be occluded unconditionally carries this:
   * `ytd-rich-item-renderer` is the home feed's primary cell, and losing its
   * floor on a declared-supported engine would fail the whole surface open.
   * The price on those engines is the pre-#1422 behaviour — a non-video cell
   * stays blurred — which is the fail-closed direction. The Lit-era lockups
   * deliberately do not carry it: their unguarded form occludes channel and
   * playlist tiles that nothing could ever release (#973, L2).
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
  // Playlist pages: rows are their own renderer, never covered by the four
  // above, so every playlist listing was unmasked (#973).
  { tag: "ytd-playlist-video-renderer", requiresVideoLink: false },
  // Legacy shorts shelf item.
  { tag: "ytd-reel-item-renderer", requiresVideoLink: false },

  // ── Polymorphic tags: need the video-link guard ──────────────────────────
  // The home feed's generic grid cell (Polymer). Wraps videos, but also ad
  // slots, Shorts shelves, posts and playlist tiles — see the header (#1422).
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
 * Each entry is a standalone selector, not one shared comma list (#1390 /
 * QC0): CSS selector-list invalidation is all-or-nothing, so an engine that
 * cannot parse one selector — e.g. `:has()` on Firefox 112–120, which the
 * manifest declares supported but which predate Firefox 121's unflagged
 * `:has()` — would otherwise drop the whole rule, including the plain tags
 * that never needed `:has()` at all. content.css gives each entry here its
 * own `{ }` block for exactly that reason; see the rationale there.
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
 * with {@link CardSelector.unguardedFallback} — shells and containers
 * included, which is precisely what makes the fallback engine's stranded
 * cells visible to `OccluderReleases` (bot-found on #1504's own review).
 *
 * Both are the stylesheet's condition written in TypeScript rather than a
 * `querySelectorAll` of the stylesheet's own selector text. It used to be
 * the latter; the container exclusion (`:not(:has(<card tags>))`) is valid
 * CSS on every engine that has `:has()` at all, but jsdom's selector engine
 * cannot parse a `:has()` nested inside `:not()`, and a reading that
 * silently returned nothing under the unit suite would leave
 * `OccluderReleases` blind exactly where it is tested. The two spellings
 * are pinned together on a real engine instead: `rich-item-cells.spec.ts`
 * asserts, for every catalogue element in the fixture, that
 * `el.matches(<its pre-mask selector>)` agrees with this function — so the
 * stylesheet cannot drift from the predicate without a rendered test
 * failing.
 *
 * Every other health signal in this workspace reads `VideoManager`'s
 * bookkeeping, and bookkeeping cannot represent an element that fell out of
 * every collection it keeps (#1421, #1425); this asks the page instead.
 *
 * `root` is required rather than defaulting to `document`: this module is the
 * logic layer, and naming a browser global here is what
 * `extension-charter/no-logic-layer-side-effects` forbids. The caller supplies
 * the tree, which also lets a test scope the query to a fixture — and, via
 * `engine`, lets a test stand on the fallback engine without being on it.
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
 *                 feed's grid cell around a lockup (#1426), or a shelf around
 *                 a row of them. It holds video links, so a link check alone
 *                 would adopt it and mount one veil over everything inside;
 *                 the cards inside are the cards, and this is never one. It
 *                 is not queued and the stylesheet does not occlude it.
 *   `shell`     — a guarded tag with no video link (yet): a channel or
 *                 playlist tile, an ad cell, or a card YouTube has not filled
 *                 in. Queued under the budget in case it hydrates.
 *   `none`      — not a catalogue tag at all.
 *
 * This is the polymorphism guard that {@link SEL} deliberately omits, applied
 * before an element is adopted so a non-video tile never reaches the
 * unresolved queue — which is what keeps the 500ms retry loop bounded by the
 * number of real video cards on the page rather than by every tile YouTube
 * happens to render (Charter §8). The stylesheet spells the same three-way
 * condition in {@link PREMASK_SELECTORS}, so the two cannot disagree about
 * which elements are cards.
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
