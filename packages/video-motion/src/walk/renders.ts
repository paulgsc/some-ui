/**
 * Studio › Renders' walk on the APK (#3476; the walk family, WALK1, #3282):
 * the board as the snips' Monday has it, an essay waiting for an oven while
 * home hears a take, another in line behind it, then down the page past the
 * render that couldn't finish to Coming, below a phone's fold, then that
 * render's own page, Run it again, where its steps are. Played on the
 * emulator (`./stage-apk`) against the stand-in home answering the snips'
 * sample (`apps/mobile/snips/sample-routes.json`), as Rust Rounds' walk is,
 * so the walk has no sample of its own and its screens say what the snips
 * of the same Monday say.
 *
 * The walk stops on Run it again: asking home again would go home, which
 * the stand-in only counts.
 *
 * Its selectors are the board's own words (`apps/www/src/lib/renders/words.ts`,
 * `conveyor.ts`, `again/words.ts`) and the links each row carries, built
 * from the sample's rows.
 */

import { z } from "zod"

import type { Walk } from "./run"

/** Home's board, as the sample serves it. */
const RENDERS = "GET /api/v1/renders"

const RowSchema = z.object({
  feed: z.string().min(1),
  key: z.string().min(1),
})

/** The snips' sample, as much of it as the walk reads. */
const SampleSchema = z
  .object({
    schema: z.literal("some-ui.stub-sample/snips/1"),
    routes: z.record(z.string(), z.object({ body: z.unknown() })),
  })
  .transform((sample, ctx) => {
    const board = z
      .object({
        // A cards essay at the oven and one in line: each opens its essay's page.
        now: RowSchema.extend({
          feed: z.literal("cards-essay"),
          state: z.literal("waiting"),
        }),
        waiting: z
          .array(RowSchema.extend({ feed: z.literal("cards-essay") }))
          .min(1),
        failed: z.array(RowSchema).min(1),
        coming: z.array(z.unknown()).min(1),
      })
      .safeParse(sample.routes[RENDERS]?.body)
    if (!board.success) {
      ctx.addIssue({
        code: "custom",
        message:
          "the sample's board has no essay waiting for an oven, none in line, nothing that couldn't finish or nothing coming",
      })
      return z.NEVER
    }
    const { now, waiting, failed } = board.data
    return { now: now.key, inLine: waiting[0]!.key, failed: failed[0]! }
  })
type Sample = z.infer<typeof SampleSchema>

/** The app's package (`apps/mobile/capacitor.config.ts`). */
const PKG = "dev.paulgsc.someui"

/** The stand-in home, as the emulator reaches the runner (`stub-home.mjs`). */
const HOME = "https://10.0.2.2:8787"

/** A cards essay's tile, by the essay's page it opens. */
const essay = (key: string): string => `a[href$="/journal/cards/${key}"]`

function walkOf({ now, inLine, failed }: Sample): Walk {
  /** The failed row's way to its own page (`ToAgain`). */
  const again = `a[href$="/journal/renders/${failed.feed}/${failed.key}"]`
  return {
    app: "renders",
    stage: { kind: "apk", pkg: PKG, path: "/journal/renders", home: HOME },
    steps: [
      {
        label: "Waiting for an oven",
        action: { kind: "open" },
        // The essay at the oven, by the way to its page under Now's strip.
        until: essay(now),
        holdMs: 3000,
      },
      {
        label: "Another, in line",
        action: { kind: "scroll", target: essay(inLine) },
        until: `${essay(inLine)} >> text=In line`,
        holdMs: 2600,
      },
      {
        label: "One that couldn't finish",
        action: { kind: "scroll", target: again },
        until: again,
        holdMs: 2200,
      },
      {
        // The page's last part, so the row above it, and its way to Run it
        // again, stay on screen for the tap that follows.
        label: "Coming",
        action: { kind: "scroll", target: 'h2:has-text("Coming")' },
        until: 'h2:has-text("Coming")',
        holdMs: 3000,
      },
      {
        label: "Run it again",
        action: { kind: "tap", target: again },
        until: 'h1:has-text("Run it again")',
        holdMs: 3200,
      },
    ],
  }
}

/** Renders' walk, from the snips' sample. */
export const renders = {
  sample: SampleSchema,
  walk: walkOf,
}
