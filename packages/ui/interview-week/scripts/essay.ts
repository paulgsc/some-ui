/**
 * The interview essay's half of the Monday routine (IW6, paulgsc/some-ui#2937):
 * `pull`, `prepare`, `finish` and `put`, as `./monday.ts` does for the week.
 * `ROUTINE.md`, "The essay on the week that ended", says when each runs; the
 * model only writes `values.json` between `prepare` and `finish`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { ESSAY_FILE, prepareEssays } from "@interview-week/lib/essay/bundle"
import type { PreparedEssays } from "@interview-week/lib/essay/bundle"
import { finishEssays } from "@interview-week/lib/essay/finish"
import {
  indexWeeks,
  INTERVIEW_INDEX,
  notesNamed,
} from "@interview-week/lib/essay/record"
import { WEEK_FILE } from "@interview-week/lib/monday/bundle"
import {
  RESUME_DATA,
  resumeEmployers,
} from "@interview-week/lib/monday/employers"
import {
  get,
  jsonFilesIn,
  jsonText,
  list,
  mailboxFromEnv,
  readJson,
  transcriptName,
} from "@some-ui/video-render/node"

import { remadeBundle, root, routineCommand, writeOut } from "./routine"

/**
 * `brief`'s interview weeks and essays, home's newest interview index, and
 * the transcripts, with their words, of every take its final weeks name.
 */
async function pull(dir: string): Promise<void> {
  const mailbox = mailboxFromEnv()
  for (const folder of ["brief", "transcript"])
    await mkdir(join(dir, folder), { recursive: true })
  let brief = 0
  for (const item of await list(mailbox, "brief")) {
    if (!WEEK_FILE.test(item.name) && !ESSAY_FILE.test(item.name)) continue
    await writeFile(
      join(dir, "brief", item.name),
      jsonText(await get(mailbox, "brief", item))
    )
    brief += 1
  }
  const newest = (await list(mailbox, "index"))
    .filter((item) => INTERVIEW_INDEX.test(item.name))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .at(-1)
  const index =
    newest === undefined ? null : await get(mailbox, "index", newest)
  await writeFile(join(dir, "index.json"), jsonText(index))
  const wanted = notesNamed(indexWeeks(index))
  let heard = 0
  for (const item of await list(mailbox, "transcript")) {
    const note = transcriptName(item.name)?.note ?? null
    if (note === null || !wanted.has(note)) continue
    await writeFile(
      join(dir, "transcript", item.name),
      jsonText(await get(mailbox, "transcript", item))
    )
    heard += 1
  }
  console.log(
    `pulled ${brief} interview weeks and essays, ${newest === undefined ? "no interview index (home has put none yet)" : newest.name}, ${heard} transcripts of ${wanted.size} takes`
  )
}

async function preparedIn(dir: string, now: Date): Promise<PreparedEssays> {
  return prepareEssays({
    now,
    brief: await jsonFilesIn(join(dir, "brief")),
    index: await readJson(join(dir, "index.json")),
    transcripts: await jsonFilesIn(join(dir, "transcript")),
  })
}

async function prepareIn(dir: string, now: Date): Promise<void> {
  const { bundle } = await preparedIn(dir, now)
  await writeFile(join(dir, "bundle.json"), jsonText(bundle))
  console.log(
    [
      `essays owed: ${bundle.essays.map((e) => e.week).join(", ") || "none"}`,
      ...bundle.waiting.map((w) => `waiting: ${w.week}, ${w.why}`),
    ].join("\n")
  )
}

/** `finish` builds from the bundle made again, never from one edited since (`remadeBundle`). */
async function finishIn(dir: string): Promise<void> {
  const { bundle } = await remadeBundle(dir, (now) => preparedIn(dir, now))
  await writeOut(
    dir,
    finishEssays({
      bundle,
      values: await readJson(join(dir, "values.json")),
      resumeEmployers: resumeEmployers(
        await readFile(join(root(), RESUME_DATA), "utf8")
      ),
    })
  )
}

await routineCommand("essay", {
  pull,
  prepare: prepareIn,
  finish: finishIn,
})
