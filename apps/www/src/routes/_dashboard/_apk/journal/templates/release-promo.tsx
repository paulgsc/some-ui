import type { JSX } from "react"
import type { PromoWords } from "@some-ui/video-render"
import { PROMO_SHAPE } from "@some-ui/video-render"
import { createFileRoute } from "@tanstack/react-router"

import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { StudioPage } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.templates.promo

const { hook, feature, close, fill } = PROMO_SHAPE

const SCENES = [
  { what: WORDS.hook, long: WORDS.lasts(hook.seconds) },
  {
    what: WORDS.feature,
    long: WORDS.featureFor(feature.before, feature.after),
  },
  { what: WORDS.close, long: WORDS.lasts(close.seconds) },
]

const WRITES: ReadonlyArray<{ what: string; words: PromoWords }> = [
  { what: WORDS.title, words: fill.title },
  { what: WORDS.caption, words: fill.caption },
  { what: WORDS.cta, words: fill.cta },
  { what: WORDS.badge, words: fill.badge },
]

const ITEM =
  "bg-card border-border/60 flex flex-col gap-1 rounded-2xl border px-4 py-3"

/**
 * The release promo on Studio's Templates page (#2722, C32): its scenes in
 * order and what the AI writes for a release, from `PROMO_SHAPE`, which the
 * promo is made from too. It has no version or preview here: it is made on
 * home for each release, from the app's walk.
 */
const ReleasePromo = (): JSX.Element => (
  <StudioPage heading={WORDS.name} intro={WORDS.intro} back="templates">
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{WORDS.scenes}</h2>
      <ol className="flex flex-col gap-2">
        {SCENES.map(({ what, long }) => (
          <li key={what} className={ITEM}>
            <span className="text-base font-extrabold">{what}</span>
            <span className="text-muted-foreground text-sm">{long}</span>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-sm">{WORDS.sounds}</p>
    </section>
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{WORDS.writes}</h2>
      <ul className="flex flex-col gap-2">
        {WRITES.map(({ what, words }) => (
          <li key={what} className={ITEM}>
            <span className="text-base font-extrabold">{what}</span>
            <span className="text-muted-foreground text-sm">
              {WORDS.limit(words.lines, words.chars)}
            </span>
          </li>
        ))}
      </ul>
    </section>
    <p className="text-muted-foreground text-sm">{WORDS.made}</p>
  </StudioPage>
)

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/templates/release-promo"
)({
  component: ReleasePromo,
})
