/**
 * The link the authorship mark's end card names (STUDIO ST16): a page on
 * the public site that teaches the grammar and draws this video's record,
 * read from the link alone, so the page keeps nothing and needs no store.
 *
 * Each scene between the intro and the end card is one character: its
 * origin (3), its wording (2) and its set of hands (8) are 48 states, one
 * digit of 48 URL-safe characters with no look-alikes (no I, l, O, 0 or 1),
 * so a link typed from a paused video reads back exactly or not at all.
 *
 * The digits and the orders below are frozen: a published video's end card
 * prints codes in them, so reordering any list changes what an old link
 * says. A change is a new parameter, never an edit.
 */

import type { AuthoredScene, AuthorshipParams } from "./authorship"

/** The record page, as the end card prints it. */
const RECORD_ADDRESS = "paulgsc.github.io/some-ui/authorship"

const DIGITS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxy"

const ORIGINS = ["you", "agent", "source"] as const
const WORDINGS = ["you", "agent"] as const
const HANDS = ["you", "agent", "code"] as const

/** A scene's record without its time: what the page draws. */
export type SceneRecord = Pick<AuthoredScene, "origin" | "wording" | "hands">

const digitOf = (s: SceneRecord): string => {
  const hands = HANDS.reduce(
    (bits, h, i) => (s.hands.includes(h) ? bits | (1 << i) : bits),
    0
  )
  const n =
    ORIGINS.indexOf(s.origin) * 16 + WORDINGS.indexOf(s.wording) * 8 + hands
  return DIGITS.charAt(n)
}

/** The record of the scenes, one character each. */
export const recordCode = (scenes: ReadonlyArray<SceneRecord>): string =>
  scenes.map(digitOf).join("")

/** The scenes a code records, or null when it isn't one. */
export function scenesOf(code: string): ReadonlyArray<SceneRecord> | null {
  const scenes: Array<SceneRecord> = []
  for (const c of code) {
    const n = DIGITS.indexOf(c)
    const origin = ORIGINS[Math.floor(n / 16)]
    const wording = WORDINGS[Math.floor(n / 8) % 2]
    if (n < 0 || origin === undefined || wording === undefined) return null
    scenes.push({
      origin,
      wording,
      hands: HANDS.filter((_, i) => (n & (1 << i)) !== 0),
    })
  }
  return scenes
}

/** The page for these scenes, as the end card prints it. */
export const recordLink = (scenes: ReadonlyArray<SceneRecord>): string =>
  `${RECORD_ADDRESS}?r=${recordCode(scenes)}`

/** A second a scene: the record page draws the intro and the end card, never the time between. */
const PAGE_SCENE_MS = 1000

/**
 * The mark's params for a record: its scenes between two bare cards, a
 * second each, so the page draws the video's own intro and end card.
 */
export function recordParams(
  between: ReadonlyArray<SceneRecord>
): AuthorshipParams {
  const bare: SceneRecord = {
    origin: "agent",
    wording: "agent",
    hands: ["code"],
  }
  const scenes = [bare, ...between, bare].map((s, i) => ({
    ...s,
    hands: [...s.hands],
    startMs: i * PAGE_SCENE_MS,
  }))
  return { scenes, endMs: scenes.length * PAGE_SCENE_MS }
}
