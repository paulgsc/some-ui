/**
 * The named extraction selectors — one list per card field — shared by the
 * extract layer, which reads them off a live element, and the layout
 * fingerprint, which records which of them a surface's cards actually
 * satisfy (BC1, #1434).
 *
 * One source of truth on purpose. The crawler's fingerprint is only worth
 * checking in if it describes the selectors the extension really uses; a
 * second copy here would let the two drift the way `PREMASK_SELECTORS` and
 * `content.css` once did (#973).
 *
 * Each field is tried against the Polymer renderers first and the Lit-era
 * lockups second. The lockup side is matched on class *substrings* and
 * element *kind* rather than position: YouTube versions these class names
 * (`…__metadata-row` gains modifiers) and reorders the rows between
 * surfaces, so `:first-child` / `:nth-child()` written against one shelf
 * silently returns the wrong row on another.
 */

/** The class every metadata text run in a Lit lockup carries. */
export const LOCKUP_TEXT =
  '[class*="yt-content-metadata-view-model__metadata-text"]'

export type CardField = "title" | "channelName" | "duration" | "uploadDate"

export const CARD_FIELDS: ReadonlyArray<CardField> = [
  "title",
  "channelName",
  "duration",
  "uploadDate",
]

/**
 * Selectors in priority order. The first one that yields non-empty text wins
 * at extraction time; the fingerprint records every one that matched.
 */
export const FIELD_SELECTORS: Readonly<
  Record<CardField, ReadonlyArray<string>>
> = {
  // Ordered most-specific first. The `yt-*-view-model` entries are the Lit-era
  // lockups adopted in #973: their title is an anchor carrying a BEM-ish class
  // rather than the `#video-title` id the Polymer renderers use.
  title: [
    "#video-title",
    "a#video-title",
    "#video-title-link",
    "yt-formatted-string#video-title",
    // Matched on a class *prefix* because YouTube appends modifiers
    // (`…__title--small`) and versions the host class.
    '[class*="lockup-metadata-view-model__title"]',
    '[class*="shortsLockupViewModelHostMetadataTitle"]',
    "h3 a",
  ],
  channelName: [
    "ytd-channel-name yt-formatted-string",
    "#channel-name yt-formatted-string",
    // The channel is the metadata run that is a link; view counts and dates
    // are plain text.
    `a${LOCKUP_TEXT}`,
  ],
  duration: [
    "span.ytd-thumbnail-overlay-time-status-renderer",
    '[class*="ThumbnailOverlayBadgeViewModel"] [class*="badge-shape"]',
  ],
  // The Polymer metadata line is "views · date" as two spans. The lockup case
  // is positional — the *last* text run of the metadata row — and is spelled
  // by `extract/meta.ts`'s `lockupUploadDate()` rather than as a selector, so
  // it is recorded here under its own name for the fingerprint's benefit.
  uploadDate: ["#metadata-line span:nth-child(2)", `span${LOCKUP_TEXT}`],
}
