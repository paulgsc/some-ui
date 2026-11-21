/**
 * Jobs' walk on the APK (WALK1–WALK3, #3282): the morning's pick read,
 * decided and built, its form's paste kit on screen, then the interview
 * week's question said and its take played back, then the record with the
 * earlier application on it. Played on the emulator (`./stage-apk`) against
 * the stand-in home answering the story sample (`apps/www/tests/walk/
 * jobs-week.json`, WALK2), with a murmur for a microphone (WALK3).
 *
 * The walk stops short of what leaves the app: the posting's own form and
 * the résumé builder open in a browser, so the walk taps neither; it shows
 * the paste kit that stays on the phone while the form is filled.
 *
 * Its selectors are the app's own words (`apps/www/src/lib/jobs/words.ts`,
 * `lib/interview-week/words.ts`) and the take kit's `data-take` states.
 */

import { z } from "zod"

import type { Walk } from "./run"

/** The sample's own part: what the walk looks for on screen. */
const SampleSchema = z.object({
  schema: z.literal("some-ui.walk-sample/jobs/1"),
  walk: z.object({
    pickId: z.string().min(1),
    title: z.string().min(1),
    company: z.string().min(1),
  }),
  /** What the stand-in home answers; read by `stub-home.mjs`, not here. */
  routes: z.record(z.string(), z.unknown()),
})
type Sample = z.infer<typeof SampleSchema>

/** The app's package (`apps/mobile/capacitor.config.ts`). */
const PKG = "dev.paulgsc.someui"

/** The stand-in home, as the emulator reaches the runner (`stub-home.mjs`). */
const HOME = "https://10.0.2.2:8787"

/** How long the take runs: long enough to read as a take, short enough to watch. */
const TAKE_MS = 4_000

/** A tab of the Jobs wing's strip. */
const tab = (label: string): string => `nav >> a:has-text("${label}")`

function walkOf(sample: Sample): Walk {
  return {
    app: "jobs",
    stage: { kind: "apk", pkg: PKG, path: "/jobs", home: HOME },
    microphone: { kind: "murmur", seconds: 12 },
    steps: [
      {
        label: "This morning's picks",
        action: { kind: "open" },
        until: `text=${sample.walk.title}`,
        holdMs: 2600,
      },
      {
        label: "One pick, read",
        // "Read it": a pick not yet decided (`readIt`, components/jobs/today.tsx).
        action: { kind: "tap", target: `a:has-text("Read it")` },
        until: "text=What they want",
        holdMs: 2600,
      },
      {
        label: "On to deciding",
        action: { kind: "tap", target: `button:has-text("On to deciding")` },
        holdMs: 2000,
      },
      {
        label: "Send it",
        action: { kind: "tap", target: `button:has-text("Send it")` },
        until: "text=I have the PDF",
        holdMs: 2200,
      },
      {
        label: "The résumé, built",
        action: { kind: "tap", target: `button:has-text("I have the PDF")` },
        until: "text=Open the posting",
        holdMs: 2600,
      },
      {
        label: "The interview week",
        action: { kind: "tap", target: tab("Interview") },
        until: `text=${sample.walk.company}`,
        holdMs: 2600,
      },
      {
        label: "The week's questions",
        action: { kind: "tap", target: `a:has-text("Questions")` },
        until: 'a[href*="/jobs/interview/q/"]',
        holdMs: 2000,
      },
      {
        label: "Today's question",
        // The list opens on today's question (IW15).
        action: { kind: "tap", target: 'a[href*="/jobs/interview/q/"]' },
        until: 'a:has-text("Say it your way")',
        holdMs: 2200,
      },
      {
        label: "Said your way",
        action: { kind: "tap", target: 'a:has-text("Say it your way")' },
        until: '[data-take="ready"]',
        holdMs: 2000,
      },
      {
        label: "Recording",
        action: { kind: "tap", target: '[data-take="ready"]' },
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
        label: "The take, kept",
        action: { kind: "tap", target: '[data-take="recording"]' },
        // The take's row ("Play the take of 0:04", the take kit's words).
        until: 'button[aria-label^="Play"]',
        holdMs: 2400,
      },
      {
        label: "Played back",
        action: { kind: "tap", target: 'button[aria-label^="Play"]' },
        moving: true,
        holdMs: 2400,
      },
      {
        label: "The record",
        action: { kind: "tap", target: tab("Record") },
        holdMs: 3000,
      },
    ],
  }
}

/** Jobs' walk, from its story sample. */
export const jobs = {
  sample: SampleSchema,
  walk: walkOf,
}
