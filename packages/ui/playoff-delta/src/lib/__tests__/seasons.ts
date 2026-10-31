/**
 * The real seasons a promise about what the short says is checked over: the
 * bundled 2025 season, and 2026 as paulgsc/testing published it on
 * 2026-10-29 (weeks 1 to 7, contract v5), the data of the first live
 * recording (#2229). Each week of each, as `[label, week, season, week]`.
 */
import raw2026 from "@playoff-delta/fixtures/season-2026.json"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  parseStorySeason,
  type StorySeason,
  type StoryWeek,
} from "@playoff-delta/lib/story"

export const SEASON_2026: StorySeason = parseStorySeason(raw2026)

export const REAL_WEEKS: ReadonlyArray<
  readonly [string, number, StorySeason, StoryWeek]
> = [SAMPLE_SEASON, SEASON_2026].flatMap((s) =>
  s.weeks.map((w) => [s.label, w.week, s, w] as const)
)
