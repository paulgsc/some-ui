/**
 * The invented season, parsed through the contract like any feed would be.
 * It stands in where no season is given (the Pages build, or a failed
 * fetch); nothing about the stage depends on it being invented.
 */

import raw from "@playoff-delta/fixtures/invented-season.json"

import { parseStorySeason, type StorySeason } from "./story"

export const SAMPLE_SEASON: StorySeason = parseStorySeason(raw)
