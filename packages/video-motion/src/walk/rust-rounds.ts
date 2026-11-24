/**
 * Rust Rounds' walk on the APK (#3476; the walk family, WALK1, #3282): the
 * week that opened Monday, its first ticket read with rustc's own words,
 * an exercise of its academy worked at the desk, a fork decided and said,
 * then every take looked over before it is sent. Played on the emulator
 * (`./stage-apk`) against the stand-in home answering the snips' sample
 * (`apps/mobile/snips/sample-routes.json`): the same Monday the APK's
 * pictures show, so the walk has no sample of its own. A murmur stands in
 * for the microphone (WALK3).
 *
 * The walk stops at the look over: sending would go home, which the
 * stand-in only counts.
 *
 * Its selectors are the week's own words (`@some-ui/rust-rounds`'
 * `lib/week-play/words.ts`), the shared decision pick's pressed buttons and
 * the take kit's `data-take` states.
 */

import { z } from "zod"

import type { Walk } from "./run"

/** The week the walk opens: the sample's newest, by its listing. */
const WEEKS = "GET /api/v1/rust-weeks"

const TicketSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  academy: z.array(z.object({ title: z.string().min(1) })).min(1),
  forks: z.array(z.object({ options: z.array(z.unknown()).min(2) })).min(1),
})

/** The snips' sample, as much of it as the walk reads. */
const SampleSchema = z
  .object({
    schema: z.literal("some-ui.stub-sample/snips/1"),
    routes: z.record(z.string(), z.object({ body: z.unknown() })),
  })
  .transform((sample, ctx) => {
    const listed = z
      .object({ weeks: z.array(z.object({ id: z.string() })).min(1) })
      .safeParse(sample.routes[WEEKS]?.body)
    const id = listed.success ? listed.data.weeks[0]?.id : undefined
    const week = z
      .object({
        week: z.object({
          company: z.object({ name: z.string().min(1) }),
          tickets: z.array(TicketSchema).min(1),
        }),
      })
      .safeParse(sample.routes[`${WEEKS}/${id ?? ""}`]?.body)
    if (!week.success) {
      ctx.addIssue({
        code: "custom",
        message: `the sample serves no week ${id ?? "at all"} with a ticket the walk can read`,
      })
      return z.NEVER
    }
    const [ticket] = week.data.week.tickets
    return { company: week.data.week.company.name, ticket: ticket! }
  })
type Sample = z.infer<typeof SampleSchema>

/** The app's package (`apps/mobile/capacitor.config.ts`). */
const PKG = "dev.paulgsc.someui"

/** The stand-in home, as the emulator reaches the runner (`stub-home.mjs`). */
const HOME = "https://10.0.2.2:8787"

/** How long the take runs: long enough to read as a take, short enough to watch. */
const TAKE_MS = 4_000

/** A button by the words it shows. */
const button = (words: string): string => `button:has-text("${words}")`

function walkOf({ company, ticket }: Sample): Walk {
  return {
    app: "rust-rounds",
    stage: { kind: "apk", pkg: PKG, path: "/rust-rounds", home: HOME },
    microphone: { kind: "murmur", seconds: 12 },
    steps: [
      {
        label: "The week, opened Monday",
        action: { kind: "open" },
        until: `text=${company}`,
        holdMs: 3000,
      },
      {
        label: "A ticket, read",
        // The brief's card for the ticket (`ticketLabel`).
        action: {
          kind: "tap",
          target: button(`${ticket.id} · ${ticket.title}`),
        },
        until: "text=The agent's recommendations",
        holdMs: 3200,
      },
      {
        label: "On to the academy",
        action: { kind: "tap", target: button("On to the academy") },
        until: "text=Before you decide, test the models",
        holdMs: 2600,
      },
      {
        label: "An exercise, at the desk",
        action: { kind: "tap", target: button(ticket.academy[0]!.title) },
        until: button("I did this at my desk"),
        holdMs: 2800,
      },
      {
        label: "Worked at your desk",
        action: { kind: "tap", target: button("I did this at my desk") },
        holdMs: 1800,
      },
      {
        label: "Back to the academy",
        action: { kind: "tap", target: button("The academy") },
        until: button("On to your decisions"),
        holdMs: 1600,
      },
      {
        label: "Your decisions",
        action: { kind: "tap", target: button("On to your decisions") },
        until: "text=Your decisions",
        holdMs: 2600,
      },
      {
        label: "An option picked",
        // The first fork's second option: not the recommended one, as a
        // decision may be (the shared decision pick's pressed buttons).
        action: {
          kind: "tap",
          target: '[role="group"] >> nth=0 >> button[aria-pressed] >> nth=1',
        },
        holdMs: 2000,
      },
      {
        label: "Recording why",
        action: { kind: "tap", target: '[data-take="ready"] >> nth=0' },
        until: '[data-take="recording"]',
        moving: true,
        holdMs: 1600,
      },
      {
        label: "Saying it",
        action: { kind: "dwell", ms: TAKE_MS },
        moving: true,
        holdMs: 2000,
      },
      {
        label: "The take, kept on the phone",
        action: { kind: "tap", target: '[data-take="recording"]' },
        holdMs: 2400,
      },
      {
        label: "Looked over before sending",
        action: { kind: "tap", target: button("Look it over before sending") },
        until: button("Send to home"),
        holdMs: 3200,
      },
    ],
  }
}

/** Rust Rounds' walk, from the snips' sample. */
export const rustRounds = {
  sample: SampleSchema,
  walk: walkOf,
}
