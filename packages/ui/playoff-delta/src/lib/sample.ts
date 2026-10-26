/**
 * The 2025 season as paulgsc/server's engine evaluates it, parsed through the
 * contract like any feed would be. It stands in where no season is given (the
 * Pages build, or a failed fetch).
 */

import raw from "@playoff-delta/fixtures/season-2025.json"

import { parseStorySeason, type StorySeason } from "./story"

export const SAMPLE_SEASON: StorySeason = parseStorySeason(raw)
