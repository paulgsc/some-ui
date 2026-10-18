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

/**
 * The lockup metadata runs an upload date can be read from, one per spelling.
 * A camelCase run counts only when it carries an `aria-label`, which the view
 * count and the age do in their long form ("8 days ago" for an "8d ago") and
 * a plain-text channel run does not.
 * `extract/meta.ts` reads them as one list, in document order.
 */
export const LOCKUP_DATE_RUNS = [
  'span[class*="yt-content-metadata-view-model__metadata-text"]',
  'span[class*="ytContentMetadataViewModelMetadataText"][aria-label]',
] as const

/**
 * On the feed the channel is the metadata run that is a link. The BEM run can
 * be the link; the camelCase run wraps one.
 */
export const CHANNEL_LINK_RUNS: ReadonlyArray<string> = [
  'a[class*="yt-content-metadata-view-model__metadata-text"]',
  '[class*="ytContentMetadataViewModelMetadataText"] a',
]

/**
 * The watch rail's plain-text channel run. `extract/meta.ts` reads it only
 * where it holds no link, and never on a collection.
 */
export const PLAIN_CHANNEL_RUN =
  'span[class*="ytContentMetadataViewModelMetadataText"]:not([aria-label])'

export type CardField = "title" | "channelName" | "duration" | "uploadDate"

/**
 * Selectors in priority order. The first one that yields non-empty text wins
 * at extraction time, except the lockup dates (see `uploadDate` below); the
 * fingerprint records every one that matched.
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
    // The whole class token, not a substring: the metadata host's own
    // `ytLockupMetadataViewModelTitleMaxLines3` would match one.
    "a.ytLockupMetadataViewModelTitle",
    '[class*="shortsLockupViewModelHostMetadataTitle"]',
    "h3 a",
  ],
  channelName: [
    "ytd-channel-name yt-formatted-string",
    "#channel-name yt-formatted-string",
    ...CHANNEL_LINK_RUNS,
    PLAIN_CHANNEL_RUN,
    // The playlist panel's row has no link and no `ytd-channel-name`.
    "span#byline",
  ],
  duration: [
    "span.ytd-thumbnail-overlay-time-status-renderer",
    '[class*="ThumbnailOverlayBadgeViewModel"] [class*="badge-shape"]',
    // The bottom overlay holds the duration. A Mix's "Mix" badge sits in a
    // corner overlay of its own and is not one.
    '[class*="ytThumbnailBottomOverlayViewModelHost"] [class*="ytBadgeShapeText"]',
  ],
  // The Polymer metadata line's last span: search puts a hidden badge and a
  // separator ahead of "views", "age" (#1864). The lockup case is positional
  // too — the *last* run, of either spelling — and is read by
  // `extract/meta.ts`'s `lockupUploadDate()`; its runs are listed here so the
  // fingerprint records them.
  uploadDate: ["#metadata-line > span:last-of-type", ...LOCKUP_DATE_RUNS],
}
