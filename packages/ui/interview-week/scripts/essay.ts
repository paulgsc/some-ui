/**
 * The interview essay's half of the Monday routine (IW6, paulgsc/some-ui#2937):
 * `pull`, `prepare`, `finish` and `put`, as `./monday.ts` does for the week.
 * `ROUTINE.md`, "The essay on the week that ended", says when each runs; the
 * model only writes `values.json` between `prepare` and `finish`.
 */
import { execFileSync } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { prepareEssays } from "@interview-week/lib/essay/bundle"
import type { PreparedEssays } from "@interview-week/lib/essay/bundle"
import { finishEssays } from "@interview-week/lib/essay/finish"
import {
  indexWeeks,
  INTERVIEW_INDEX,
  noteOfTranscript,
  notesNamed,
} from "@interview-week/lib/essay/record"
import {
  RESUME_DATA,
  resumeEmployers,
} from "@interview-week/lib/monday/employers"
import {
  fail,
  get,
  here,
  jsonFilesIn,
  jsonText,
  list,
  mailboxFromEnv,
  put,
  readJson,
  Refused,
  runCommand,
} from "@some-ui/video-render/node"
import { z } from "zod"

const USAGE = [
  "usage: essay pull --to <dir>",
  "       essay prepare --from <dir> [--now <instant>]",
  "       essay finish --from <dir>",
  "       essay put --from <dir>",
]

const root = (): string =>
  execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim()

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
    if (!/^interview-(week|essay)-/.test(item.name)) continue
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
    const note = noteOfTranscript(item.name)
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

/** `finish` builds from the bundle made again, never from one edited since. */
async function finishIn(dir: string): Promise<void> {
  const held = z
    .object({ now: z.iso.datetime() })
    .safeParse(await readJson(join(dir, "bundle.json")))
  if (!held.success) fail(["bundle.json isn't prepare's: run prepare again"])
  const { bundle } = await preparedIn(dir, new Date(held.data.now))
  if (jsonText(bundle) !== (await readFile(join(dir, "bundle.json"), "utf8")))
    fail(["bundle.json changed since prepare wrote it: run prepare again"])
  const finished = finishEssays({
    bundle,
    values: await readJson(join(dir, "values.json")),
    resumeEmployers: resumeEmployers(
      await readFile(join(root(), RESUME_DATA), "utf8")
    ),
  })
  if (!finished.ok)
    fail(["not ready:", ...finished.problems.map((p) => `- ${p}`)])
  await rm(join(dir, "out"), { recursive: true, force: true })
  await mkdir(join(dir, "out"))
  for (const file of finished.files)
    await writeFile(join(dir, "out", file.name), jsonText(file.body))
  console.log(
    finished.files.length === 0
      ? "ready: nothing to put"
      : ["ready:", ...finished.files.map((f) => `- ${f.name}`)].join("\n")
  )
}

/** Puts every essay `finish` wrote into `brief`, where home reads it. */
async function putFrom(dir: string): Promise<void> {
  const mailbox = mailboxFromEnv()
  const lines: Array<string> = []
  let failed = false
  for (const file of await jsonFilesIn(join(dir, "out"))) {
    const { status, text } = await put(mailbox, "brief", file.name, file.body)
    const ok = status === 201 || status === 200
    failed ||= !ok
    lines.push(`${file.name}: ${status}${ok ? "" : ` ${text.trim()}`}`)
  }
  console.log(lines.join("\n") || "nothing to put")
  if (failed) fail(["a put was refused"])
}

await runCommand(async () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      to: { type: "string" },
      from: { type: "string" },
      now: { type: "string" },
    },
  })
  const [command] = positionals
  switch (command) {
    case "pull": {
      if (values.to === undefined) fail(USAGE)
      return pull(here(values.to))
    }
    case "prepare": {
      if (values.from === undefined) fail(USAGE)
      const now = values.now === undefined ? new Date() : new Date(values.now)
      if (Number.isNaN(now.getTime()))
        fail([`--now ${values.now ?? ""} isn't an instant`])
      return prepareIn(here(values.from), now)
    }
    case "finish": {
      if (values.from === undefined) fail(USAGE)
      return finishIn(here(values.from))
    }
    case "put": {
      if (values.from === undefined) fail(USAGE)
      return putFrom(here(values.from))
    }
    default: {
      throw new Refused(USAGE.join("\n"))
    }
  }
})
