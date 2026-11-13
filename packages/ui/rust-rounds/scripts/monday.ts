/**
 * The Monday routine's code (RR18, paulgsc/some-ui#2693): `pull`, `prepare`,
 * `finish` and `put`. `ROUTINE.md` says when each runs; the model only writes
 * the values file between `prepare` and `finish`.
 */
import { spawnSync } from "node:child_process"
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import type { RustcRun } from "@rust-rounds/lib/formats"
import type { MailboxFile, Prepared } from "@rust-rounds/lib/monday/bundle"
import { prepare } from "@rust-rounds/lib/monday/bundle"
import { finish } from "@rust-rounds/lib/monday/finish"
import { noteOfTranscript, notesNamed } from "@rust-rounds/lib/monday/mailbox"
import { indexWeeks, WeekRecordSchema } from "@rust-rounds/lib/monday/record"
import type { Ran } from "@rust-rounds/lib/monday/rustc"
import {
  recorded,
  RUN_SECONDS,
  RUSTC_FLAGS,
  toolchainOf,
} from "@rust-rounds/lib/monday/rustc"
import { ValuesSchema } from "@rust-rounds/lib/monday/values"
import {
  fail,
  get,
  here,
  list,
  mailboxFromEnv,
  put,
  readJson,
  Refused,
  runCommand,
} from "@some-ui/video-render/node"
import { z } from "zod"

const USAGE = [
  "usage: monday pull --to <dir>",
  "       monday prepare --from <dir> [--now <instant>]",
  "       monday finish --from <dir>",
  "       monday put --from <dir>",
]

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

async function filesIn(dir: string): Promise<Array<MailboxFile>> {
  const names = await readdir(dir).catch(() => [])
  return Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map(async (name) => ({ name, body: await readJson(join(dir, name)) }))
  )
}

/** The newest of home's Rust Rounds indexes: the greatest name, as the README says. */
const RUST_INDEX = /^index-rust-\d{8}T\d{9}Z\.json$/

/**
 * `brief`'s weeks and essays; home's final record of each week past its
 * deadline, from the newest `rust` index; and the transcripts of every note
 * those records name.
 */
async function pull(dir: string): Promise<void> {
  const mailbox = mailboxFromEnv()
  await mkdir(join(dir, "brief"), { recursive: true })
  await mkdir(join(dir, "records"), { recursive: true })
  await mkdir(join(dir, "transcript"), { recursive: true })
  const index = (await list(mailbox, "index"))
    .filter((item) => RUST_INDEX.test(item.name))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .at(-1)
  const weeks =
    index === undefined ? [] : indexWeeks(await get(mailbox, "index", index))
  for (const week of weeks) {
    await writeFile(join(dir, "records", `${week.week}.json`), json(week))
  }
  let briefCount = 0
  for (const item of await list(mailbox, "brief")) {
    if (!/^rust-(week|essay)-/.test(item.name)) continue
    await writeFile(
      join(dir, "brief", item.name),
      json(await get(mailbox, "brief", item))
    )
    briefCount += 1
  }
  const records = (await filesIn(join(dir, "records"))).flatMap((file) => {
    const parsed = WeekRecordSchema.safeParse(file.body)
    return parsed.success ? [parsed.data] : []
  })
  const wanted = notesNamed(records)
  let heard = 0
  for (const item of await list(mailbox, "transcript")) {
    const note = noteOfTranscript(item.name)
    if (note === null || !wanted.has(note)) continue
    await writeFile(
      join(dir, "transcript", item.name),
      json(await get(mailbox, "transcript", item))
    )
    heard += 1
  }
  console.log(
    `pulled ${briefCount} weeks and essays, ${weeks.length} final records${index === undefined ? " (home has put no Rust Rounds index yet)" : ""}, ${heard} transcripts of ${wanted.size} notes`
  )
}

/** What `prepare` makes of the run's folder at `now`. */
async function preparedIn(dir: string, now: Date): Promise<Prepared> {
  return prepare({
    now,
    brief: await filesIn(join(dir, "brief")),
    records: (await filesIn(join(dir, "records"))).map((file) => file.body),
    transcripts: await filesIn(join(dir, "transcript")),
  })
}

async function prepareIn(dir: string, now: Date): Promise<void> {
  const { bundle } = await preparedIn(dir, now)
  await writeFile(join(dir, "bundle.json"), json(bundle))
  console.log(
    [
      `essays to write: ${bundle.essays.map((e) => e.week).join(", ") || "none"}`,
      ...bundle.waiting.map((w) => `waiting: ${w.week}, ${w.why}`),
      `next week: ${bundle.next?.id ?? "already in the mailbox"}`,
      `due a recheck: ${bundle.due.map((d) => `${d.id} (${d.why})`).join(", ") || "none"}`,
      ...bundle.unread.map((u) => `unread: ${u.name}, ${u.why}`),
    ].join("\n")
  )
}

/** Each of the values' week's programs, compiled and run as home records them. */
async function runPrograms(values: unknown): Promise<Record<string, RustcRun>> {
  const parsed = ValuesSchema.safeParse(values)
  if (!parsed.success || parsed.data.week === null) return {}
  const version = spawnSync("rustc", ["--version"], { encoding: "utf8" })
  if (version.status !== 0)
    fail(["rustc isn't installed: install a current stable rustc"])
  const toolchain = toolchainOf(version.stdout)
  const runs: Record<string, RustcRun> = {}
  for (const ticket of parsed.data.week.tickets) {
    const dir = await mkdtemp(join(tmpdir(), "rust-monday-"))
    try {
      await writeFile(join(dir, "main.rs"), ticket.program)
      const compile = spawnSync(
        "rustc",
        ["main.rs", ...RUSTC_FLAGS, "-o", "main"],
        { cwd: dir, encoding: "utf8" }
      )
      let run: Ran["run"] = null
      if (compile.status === 0) {
        const ran = spawnSync(join(dir, "main"), [], {
          cwd: dir,
          encoding: "utf8",
          timeout: RUN_SECONDS * 1000,
          input: "",
          // A panic's message only, as home's sandbox prints it.
          env: { ...process.env, RUST_BACKTRACE: "0" },
        })
        run = {
          status: ran.status,
          timedOut:
            ran.error !== undefined &&
            "code" in ran.error &&
            ran.error.code === "ETIMEDOUT",
          stdout: ran.stdout,
          stderr: ran.stderr,
        }
      }
      runs[ticket.id] = recorded({
        toolchain,
        compile: { status: compile.status, stderr: compile.stderr },
        run,
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
  return runs
}

/**
 * The bundle `prepare` wrote is made again from the same folder and moment,
 * so `finish` builds from code's facts, never from a bundle edited since.
 */
async function finishIn(dir: string): Promise<void> {
  const held = z
    .object({ now: z.iso.datetime() })
    .safeParse(await readJson(join(dir, "bundle.json")))
  if (!held.success) fail(["bundle.json isn't prepare's: run prepare again"])
  const { bundle, history } = await preparedIn(dir, new Date(held.data.now))
  if (json(bundle) !== (await readFile(join(dir, "bundle.json"), "utf8"))) {
    fail(["bundle.json changed since prepare wrote it: run prepare again"])
  }
  const values = await readJson(join(dir, "values.json"))
  const runs = await runPrograms(values)
  await writeFile(join(dir, "runs.json"), json(runs))
  const finished = finish({ bundle, history, values, runs })
  if (!finished.ok)
    fail(["not ready:", ...finished.problems.map((p) => `- ${p}`)])
  await rm(join(dir, "out"), { recursive: true, force: true })
  await mkdir(join(dir, "out"))
  for (const file of finished.files) {
    await writeFile(join(dir, "out", file.name), json(file.body))
  }
  console.log(
    ["ready:", ...finished.files.map((f) => `- ${f.name}`)].join("\n")
  )
}

/** Puts every file `finish` wrote into `brief`, the week first. */
async function putFrom(dir: string): Promise<void> {
  const mailbox = mailboxFromEnv()
  const files = await filesIn(join(dir, "out"))
  files.sort(
    (a, b) =>
      Number(b.name.startsWith("rust-week-")) -
      Number(a.name.startsWith("rust-week-"))
  )
  const lines: Array<string> = []
  let failed = false
  for (const file of files) {
    const { status, text } = await put(mailbox, "brief", file.name, file.body)
    const ok = status === 201 || status === 200
    failed ||= !ok
    lines.push(`${file.name}: ${status}${ok ? "" : ` ${text.trim()}`}`)
  }
  console.log(lines.join("\n"))
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
