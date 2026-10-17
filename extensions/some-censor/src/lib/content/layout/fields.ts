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
 * Lockups come in two class spellings, BEM and camelCase, and the lockup
 * selectors here name both.
 */

/** A BEM lockup's metadata text run; its channel run is an `<a>` instead. */
const BEM_TEXT_RUN =
  'span[class*="yt-content-metadata-view-model__metadata-text"]'

/**
 * A camelCase lockup's labelled metadata run. The view count and the age carry
 * an `aria-label` in their long form; the channel run, also a `span` of this
 * class, carries none, so it can never be read as the date whatever the row
 * order or the channel's name.
 */
const CAMEL_LABELLED_RUN =
  'span[class*="ytContentMetadataViewModelMetadataText"][aria-label]'

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
    '[class*="shortsLockupViewModelHostMetadataTitle"]',
    "h3 a",
  ],
  channelName: [
    "ytd-channel-name yt-formatted-string",
    "#channel-name yt-formatted-string",
    // The channel is the metadata run that is a link; view counts and dates
    // are plain text. The BEM run is the link; the camelCase run wraps one.
    'a[class*="yt-content-metadata-view-model__metadata-text"]',
    '[class*="ytContentMetadataViewModelMetadataText"] a',
  ],
  duration: [
    "span.ytd-thumbnail-overlay-time-status-renderer",
    '[class*="ThumbnailOverlayBadgeViewModel"] [class*="badge-shape"]',
    '[class*="ytThumbnailBadgeViewModelHost"] [class*="ytBadgeShapeText"]',
  ],
  // The Polymer metadata line is "views · date" as two spans. The lockup cases
  // are positional — the *last* matching run — and are spelled by
  // `extract/meta.ts`'s `lockupUploadDate()` rather than as selectors, so
  // they are recorded here under their own names for the fingerprint.
  uploadDate: [
    "#metadata-line span:nth-child(2)",
    BEM_TEXT_RUN,
    CAMEL_LABELLED_RUN,
  ],
}
