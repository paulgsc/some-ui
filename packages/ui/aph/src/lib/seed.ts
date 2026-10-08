/**
 * The paper notes this replaces, transcribed: Sep 14 to Oct 2, 2026.
 *
 * They hold my figures and the goals only. No reported figure was ever
 * written down, so every entry here starts `awaiting` theirs.
 *
 * Read as written, with three judgement calls, each visible in the data
 * rather than smoothed over:
 *
 * - "@4" (Sep 20) and "@5" (Sep 25) are off the checkpoints; their times are
 *   kept as written, AM or PM unknown.
 * - Sep 24's "@~5200:w-o-bs" has no time. It is kept with `time: null`, which
 *   History flags.
 * - Sep 22's "@12 ~5200:w/o:office~4200" is two figures at noon: ~5,200, and
 *   ~4,200 under "w/o office".
 *
 * The first launch starts from these and keeps them (`store.ts`); after
 * that, what the phone keeps wins.
 */
import type { AphSettings, Entry } from "./model"

export const SEED_SETTINGS: AphSettings = {
  checkpoints: [
    { id: "7", label: "7:00", minutes: 7 * 60, goal: 4100 },
    { id: "12", label: "12:00", minutes: 12 * 60, goal: 5100 },
  ],
  labels: ["no-bs", "w-o-bs", "w/o office"],
  step: 100,
  usualLow: 3000,
  usualHigh: 6500,
  tolerance: 100,
  since: "2026-09-14",
}

type Written = {
  day: string
  at: "7" | "12" | { time: string | null }
  value: number
  approx?: boolean
  labels?: ReadonlyArray<string>
}

const WRITTEN: ReadonlyArray<Written> = [
  { day: "2026-09-16", at: "7", value: 4000 },
  { day: "2026-09-16", at: "12", value: 5600 },
  { day: "2026-09-17", at: "7", value: 4500 },
  { day: "2026-09-17", at: "12", value: 4600 },
  { day: "2026-09-18", at: "7", value: 5200 },
  { day: "2026-09-18", at: "12", value: 4200 },
  { day: "2026-09-20", at: { time: "4:00" }, value: 4700 },
  { day: "2026-09-22", at: "7", value: 3900, labels: ["no-bs"] },
  { day: "2026-09-22", at: "12", value: 5200 },
  { day: "2026-09-22", at: "12", value: 4200, labels: ["w/o office"] },
  { day: "2026-09-23", at: "7", value: 3900 },
  { day: "2026-09-24", at: "7", value: 4500, labels: ["no-bs"] },
  { day: "2026-09-24", at: { time: null }, value: 5200, labels: ["w-o-bs"] },
  { day: "2026-09-25", at: { time: "5:00" }, value: 3800 },
  { day: "2026-09-28", at: "7", value: 3700 },
  // The one figure written without a "~".
  { day: "2026-09-28", at: "12", value: 4200, approx: false },
  { day: "2026-09-29", at: "7", value: 5300 },
  { day: "2026-09-29", at: "12", value: 5000 },
  { day: "2026-10-01", at: "7", value: 5300 },
  { day: "2026-10-01", at: "12", value: 4600 },
  { day: "2026-10-02", at: "7", value: 4300 },
]

export const SEED_ENTRIES: ReadonlyArray<Entry> = WRITTEN.map((w, i) => {
  const checkpoint =
    typeof w.at === "string"
      ? (SEED_SETTINGS.checkpoints.find((c) => c.id === w.at) ?? null)
      : null
  return {
    id: `paper-${i}`,
    day: w.day,
    checkpoint: checkpoint?.id ?? null,
    time: typeof w.at === "string" ? null : w.at.time,
    mine: { value: w.value, approx: w.approx ?? true },
    theirs: null,
    goal: checkpoint?.goal ?? null,
    labels: w.labels ?? [],
    note: null,
    review: null,
  }
})
