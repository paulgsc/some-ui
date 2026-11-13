/**
 * The decay record's sample (RR19, paulgsc/some-ui#2695): six judged weeks
 * ending on Quillmoss's week 46, so every state is drawn. The sample essay
 * (`@some-ui/video-render`'s `sample-essay.json`) carries the chart and role
 * line the record derives from it.
 *
 * - **Borrows into a reused buffer:** relational in week 41, unchecked past
 *   its recheck (may have faded), then multistructural in week 46: decay.
 * - **Allocation on the hot path**, **Lifetime elision:** relational, faded
 *   while unchecked, relational again in week 46.
 * - **Send and Sync:** unistructural in week 44, met and not yet known.
 * - **Cancellation safety:** left silent in week 45.
 * - **'static and threads:** left silent in week 46.
 */
import type { Concept, Judged } from "@rust-rounds/lib/decay"

const concept = (id: string, name: string): Concept => ({ id, name })

const BORROWS = concept(
  "borrows-into-a-reused-buffer",
  "Borrows into a reused buffer"
)
const ALLOCATION = concept(
  "allocation-on-the-hot-path",
  "Allocation on the hot path"
)
const ELISION = concept("lifetime-elision", "Lifetime elision")
const SEND_SYNC = concept("send-and-sync", "Send and Sync")
const CANCELLATION = concept("cancellation-safety", "Cancellation safety")
const STATIC = concept("static-and-threads", "'static and threads")

export const SAMPLE_JUDGED: ReadonlyArray<Judged> = [
  { week: "2026-w41", tickets: [{ concepts: [BORROWS], level: 4 }] },
  { week: "2026-w42", tickets: [{ concepts: [ALLOCATION], level: 4 }] },
  { week: "2026-w43", tickets: [{ concepts: [ELISION], level: 4 }] },
  { week: "2026-w44", tickets: [{ concepts: [SEND_SYNC], level: 2 }] },
  { week: "2026-w45", tickets: [{ concepts: [CANCELLATION], level: null }] },
  // Quillmoss's week 46, as the sample essay judged it.
  {
    week: "2026-w46",
    tickets: [
      { concepts: [ALLOCATION, ELISION], level: 4 },
      { concepts: [BORROWS], level: 3 },
      { concepts: [STATIC], level: null },
    ],
  },
]

/** Week 46's concepts in its tickets' order: the chart's first rows. */
export const SAMPLE_FIRST: ReadonlyArray<Concept> = [
  ALLOCATION,
  ELISION,
  BORROWS,
  STATIC,
]
