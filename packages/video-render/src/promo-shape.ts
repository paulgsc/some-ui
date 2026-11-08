/**
 * The release promo's shape (HYPER3, #2726; on Studio's Templates page,
 * C32): its scenes' lengths and the limits on its words. `@some-ui/video-motion`'s `promo.ts` makes the promo from these
 * numbers, and the phone's Templates page reads them, so the two can't
 * differ. It is no `Format`: its scenes are compositions, and its feature
 * lasts as long as the app's walk.
 */

/** A place for words: at most `lines` lines of at most `chars` characters. */
export type PromoWords = { readonly lines: number; readonly chars: number }

export const PROMO_SHAPE = {
  /** The series it is drawn in: version 2 names the sound kit (HYPER4). */
  series: { id: "vertical", version: 2 },
  /** The opening: the app's name and the facts on its chips. */
  hook: { seconds: 3.2 },
  /** The app as its walk shows it, with this long before and after it. */
  feature: { before: 0.8, after: 0.6 },
  /** Where to get it. */
  close: { seconds: 4 },
  /** What a release's words say, as the AI writes them. */
  fill: {
    title: { lines: 2, chars: 10 },
    /** One per screen of the walk. */
    caption: { lines: 2, chars: 24 },
    cta: { lines: 2, chars: 18 },
    /** Two of them, on the close. */
    badge: { lines: 1, chars: 18 },
    /** The opening's two chips: where it runs, and where it stands. */
    platform: { lines: 1, chars: 18 },
    stage: { lines: 1, chars: 22 },
  },
} as const
