/**
 * A cards essay (CARDS7, #2979): a silent video of cards, each claim stamped
 * with the commits it was checked against, that home renders as it renders
 * the weekly call. A session writes the cut list; everything after it is
 * code. `paulgsc/testing` keeps each as `cards/<key>.json`, listed in
 * `cards/index.json` (C327), and home reads that index hourly
 * (`CARDS-ROUTINE.md`).
 *
 * The file is the cut list itself, as `sample/videos/<video>/cut-list.json`
 * is. Its key is a slug and its stamp's day (`nixos-upgrade-2026-11-14`),
 * so the same subject checked again on a later day is a new essay. Home has
 * no captures or takes for one: every scene is a card picture, and none
 * plays a take.
 */

import { z } from "zod"

import type { CutList, Parsed } from "./cut-list"
import { isCaptions, parseCutList, problemsOf } from "./cut-list"

export const CARDS_INDEX_SCHEMA = "some-ui.cards-index/1"

/** The series a cards essay may be drawn in. */
export const CARDS_SERIES: ReadonlySet<string> = new Set(["cheat-sheet"])

/** A slug, then the stamp's day: `<slug>-<YYYY-MM-DD>`. */
export const CARDS_KEY = /^[a-z0-9]+(-[a-z0-9]+)*-(\d{4}-\d{2}-\d{2})$/

const KeySchema = z.string().regex(CARDS_KEY, "it isn't <slug>-<YYYY-MM-DD>")

/** The essays `cards/` holds, newest first, each `<key>.json` beside it. */
export const CardsIndexSchema = z
  .strictObject({
    schema: z.literal(CARDS_INDEX_SCHEMA),
    essays: z.array(z.strictObject({ key: KeySchema })),
  })
  .refine(
    (index) =>
      index.essays.every(
        (e, i) => i === 0 || dayOf(e.key) <= dayOf(index.essays[i - 1]?.key)
      ) && new Set(index.essays.map((e) => e.key)).size === index.essays.length,
    { message: "its essays aren't newest first, each once", path: ["essays"] }
  )

export type CardsIndex = z.infer<typeof CardsIndexSchema>

function dayOf(key: string | undefined): string {
  return CARDS_KEY.exec(key ?? "")?.[2] ?? ""
}

export function parseCardsIndex(raw: unknown): Parsed<CardsIndex> {
  const parsed = CardsIndexSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "cards index") }
}

/**
 * The cut list `raw` as the essay `key`, or every reason home can't render
 * it: what any cut list is refused for (`parseCutList`), a key that isn't
 * its stamp's day, a series that isn't a cards series, a scene that isn't
 * a card, plays a take or a cue or stands on an image, and captions. What
 * only drawing finds (a line that doesn't fit, a character the font lacks)
 * is refused when it is recorded (`record:cards`).
 */
export function parseCardsEssay(key: string, raw: unknown): Parsed<CutList> {
  if (!CARDS_KEY.test(key))
    return { ok: false, problems: [`${key}: it isn't <slug>-<YYYY-MM-DD>`] }
  const cut = parseCutList(raw)
  if (!cut.ok) return cut
  const { series, stamp, shots } = cut.value
  const problems = [
    ...(stamp === undefined
      ? ["it has no stamp: a cards essay says what it was checked against"]
      : stamp.date === dayOf(key)
        ? []
        : [`its stamp is dated ${stamp.date}, and its key ${dayOf(key)}`]),
    ...(CARDS_SERIES.has(series.id)
      ? []
      : [
          `it is drawn in ${series.id}, and an essay is drawn in ${[...CARDS_SERIES].join(" or ")}`,
        ]),
    ...shots
      .filter((s) => s.take !== undefined)
      .map((s) => `${s.id}: it plays a take, and nothing is said over cards`),
    ...shots
      .filter((s) => s.overrides.background?.kind === "image")
      .map(
        (s) => `${s.id}: its background is an image, which home doesn't have`
      ),
    ...shots
      .filter((s) => (s.overrides.cues ?? []).length > 0)
      .map((s) => `${s.id}: it plays cues, and a cards essay is silent`),
    ...(cut.value.burnIns.some(isCaptions)
      ? ["it asks for captions, and nothing is said to caption"]
      : []),
    ...shots
      .filter((s) => s.picture.kind !== "card")
      .map((s) => `${s.id}: its picture is a ${s.picture.kind}, not a card`),
  ]
  return problems.length > 0 ? { ok: false, problems } : cut
}

/**
 * Every reason a `cards/` folder can't be published: its index unread, an
 * essay it lists missing, refused (`parseCardsEssay`) or pinning a version
 * of its series that `versionsOf` doesn't hold, and an essay file the index
 * forgets. `files` is the folder's JSON files by name, `index.json` among
 * them.
 */
export function cardsFolderProblems(
  files: ReadonlyMap<string, unknown>,
  versionsOf: (series: string) => ReadonlySet<number>
): Array<string> {
  const index = parseCardsIndex(files.get("index.json"))
  if (!index.ok) return index.problems.map((p) => `index.json: ${p}`)
  const listed = new Set(index.value.essays.map((e) => `${e.key}.json`))
  return [
    ...index.value.essays.flatMap(({ key }) => {
      const name = `${key}.json`
      if (!files.has(name))
        return [`${name}: the index lists it, and there is no such file`]
      const essay = parseCardsEssay(key, files.get(name))
      if (!essay.ok) return essay.problems.map((p) => `${name}: ${p}`)
      const { id, version } = essay.value.series
      return versionsOf(id).has(version)
        ? []
        : [`${name}: ${id} has no version ${version}`]
    }),
    ...[...files.keys()]
      .filter((name) => name !== "index.json" && !listed.has(name))
      .map((name) => `${name}: the index doesn't list it`),
  ]
}
