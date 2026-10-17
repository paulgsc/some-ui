/**
 * The named extraction selectors — one list per card field — shared by the
 * extract layer, which reads them off a live element, and the layout
 * fingerprint, which records which of them a surface's cards actually
 * satisfy (BC1).
 *
 * One source of truth on purpose. The crawler's fingerprint is only worth
 * checking in if it describes the selectors the extension really uses; a
 * second copy would let the two drift.
 *
 * Each field is tried against the Polymer renderers first and the Lit-era
 * lockups second. The lockup side is matched on class *substrings* and
 * element *kind* rather than position: YouTube versions these class names
 * (`…__metadata-row` gains modifiers) and reorders the rows between
 * surfaces, so `:first-child` / `:nth-child()` written against one shelf
 * silently returns the wrong row on another.
 *
 * The lockups come in two class spellings, and every lockup selector names
 * both. The BEM one (`yt-content-metadata-view-model__metadata-text`) is what
 * the e2e fixtures were first written against; youtube.com served the
 * camelCase one (`ytContentMetadataViewModelMetadataText`) by 2026-10-17, when
 * an export of the owner's diagnostics showed no lockup yielding a date, and a
 * headless capture of a channel page showed why. Which one a browser gets is
 * the vendor's choice, so neither is dropped.
 */

/** The class every metadata text run in a Lit lockup carries, per spelling. */
const LOCKUP_TEXT_CLASSES = [
  "yt-content-metadata-view-model__metadata-text",
  "ytContentMetadataViewModelMetadataText",
] as const

/**
 * Every metadata text run in a lockup, as one selector list, so
 * `querySelectorAll` returns the runs of either spelling in document order.
 * The camelCase run is a `span` that may wrap a link; the BEM run is either
 * that `span` or the link itself.
 */
export const LOCKUP_TEXT_RUNS = LOCKUP_TEXT_CLASSES.map(
  (c) => `span[class*="${c}"]`
).join(", ")

export type CardField = "title" | "channelName" | "duration" | "uploadDate"

/**
 * Selectors in priority order. The first one that yields non-empty text wins
 * at extraction time; the fingerprint records every one that matched.
 */
export const FIELD_SELECTORS: Readonly<
  Record<CardField, ReadonlyArray<string>>
> = {
  // Ordered most-specific first. The `yt-*-view-model` entries are the Lit-era
  // lockups: their title is an anchor carrying a BEM or camelCase class
  // rather than the `#video-title` id the Polymer renderers use.
  title: [
    "#video-title",
    "a#video-title",
    "#video-title-link",
    "yt-formatted-string#video-title",
    // Matched on a class *prefix* because YouTube appends modifiers
    // (`…__title--small`) and versions the host class.
    '[class*="lockup-metadata-view-model__title"]',
    '[class*="ytLockupMetadataViewModelTitle"]',
    '[class*="shortsLockupViewModelHostMetadataTitle"]',
    "h3 a",
  ],
  channelName: [
    "ytd-channel-name yt-formatted-string",
    "#channel-name yt-formatted-string",
    // The channel is the metadata run that is a link; view counts and dates
    // are plain text. The BEM run is the link; the camelCase run wraps one.
    'a[class*="yt-content-metadata-view-model__metadata-text"]',
    '[class*="ytContentMetadataViewModelMetadataText"] a[href^="/@"]',
    '[class*="ytContentMetadataViewModelMetadataText"] a[href^="/channel/"]',
  ],
  duration: [
    "span.ytd-thumbnail-overlay-time-status-renderer",
    '[class*="ThumbnailOverlayBadgeViewModel"] [class*="badge-shape"]',
    // camelCase: the badge sits in a bottom overlay, and its text is a class.
    '[class*="ytThumbnailBadgeViewModelHost"] [class*="ytBadgeShapeText"]',
  ],
  // The Polymer metadata line is "views · date" as two spans. The lockup case
  // is positional — the *last* text run of the metadata row — and is spelled
  // by `extract/meta.ts`'s `lockupUploadDate()` rather than as a selector, so
  // it is recorded here under its own name for the fingerprint's benefit.
  uploadDate: ["#metadata-line span:nth-child(2)", LOCKUP_TEXT_RUNS],
}
