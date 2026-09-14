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
 * The `ytd-*-renderer` custom elements are YouTube's Polymer generation. Each
 * tag means exactly one thing, and every instance of it is a video, so matching
 * the tag is sufficient.
 *
 * `yt-lockup-view-model` is the Lit-era replacement, and it is *polymorphic*:
 * the same tag renders a video, a playlist, a channel, a podcast, or a
 * "collection" shelf tile, distinguished only by its content. This is what #973
 * ran into from the other side — the tag was missing entirely, so every card in
 * the newer shelves (the upcoming-feed slider, watch-next, most of search) went
 * unmasked. Adding the bare tag would have over-corrected: a channel lockup can
 * never produce a videoId, so it would be occluded by the pre-mask rule with no
 * content script coming to replace that occlusion, and it would sit in the
 * manager's unresolved queue keeping the retry loop alive forever.
 *
 * So the polymorphic tags carry `requiresVideoLink`. A lockup counts as a card
 * only once it contains a watch or shorts href — the same condition, expressed
 * as `:has()` in the stylesheet and as {@link isVideoCard} in TypeScript, so
 * the two layers cannot drift into disagreeing about what a card is.
 */

/** A tracked card element type. */
export type CardSelector = {
  /** Custom-element tag name. */
  readonly tag: string
  /**
   * `true` for polymorphic tags that also render non-video content. Such an
   * element is only treated as a card once it contains a video link.
   */
  readonly requiresVideoLink: boolean
}

/** Anchor shapes that identify an element as pointing at a watchable video. */
export const VIDEO_LINK_SELECTOR = 'a[href*="/watch"], a[href*="/shorts/"]'

export const CARD_SELECTORS: ReadonlyArray<CardSelector> = [
  // ── Polymer generation: tag alone is decisive ────────────────────────────
  { tag: "ytd-video-renderer", requiresVideoLink: false },
  { tag: "ytd-rich-item-renderer", requiresVideoLink: false },
  { tag: "ytd-grid-video-renderer", requiresVideoLink: false },
  { tag: "ytd-compact-video-renderer", requiresVideoLink: false },
  { tag: "ytd-playlist-panel-video-renderer", requiresVideoLink: false },
  // Playlist pages: rows are their own renderer, never covered by the four
  // above, so every playlist listing was unmasked (#973).
  { tag: "ytd-playlist-video-renderer", requiresVideoLink: false },
  // Legacy shorts shelf item.
  { tag: "ytd-reel-item-renderer", requiresVideoLink: false },

  // ── Lit generation: polymorphic, needs the video-link guard ──────────────
  // The unified card behind the upcoming-feed slider, watch-next and search.
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
      ? `${tag}:has(${VIDEO_LINK_SELECTOR}):not([data-boyo])`
      : `${tag}:not([data-boyo])`
)

/**
 * Is this element a card BOYO should own?
 *
 * Applies the polymorphism guard that {@link SEL} deliberately omits. Called
 * before an element is adopted, so a non-video lockup never reaches the
 * unresolved queue — which is what keeps the 500ms retry loop bounded by the
 * number of real video cards on the page rather than by every tile YouTube
 * happens to render (Charter §8).
 */
export function isVideoCard(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase()
  const entry = CARD_SELECTORS.find((s) => s.tag === tag)
  if (!entry) return false
  if (!entry.requiresVideoLink) return true
  return el.querySelector(VIDEO_LINK_SELECTOR) !== null
}
