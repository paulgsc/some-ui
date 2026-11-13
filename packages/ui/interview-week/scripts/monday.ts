/**
 * The interview week's Monday routine (IW4, paulgsc/some-ui#2935): `pull`,
 * `prepare`, `finish` and `put`. `ROUTINE.md` says when each runs; the model
 * only writes the values file between `prepare` and `finish`. The mailbox
 * client and the command helpers are `@some-ui/video-render/node`'s, which
 * Rust Rounds' routine shares.
 */
import { execFileSync } from "node:child_process"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import type { MailboxFile, Prepared } from "@interview-week/lib/monday/bundle"
import { prepare, WEEK_FILE } from "@interview-week/lib/monday/bundle"
import type { Doc } from "@interview-week/lib/monday/corpus"
import {
  callsOf,
  docsOf,
  epicsOf,
  invariantsOf,
} from "@interview-week/lib/monday/corpus"
import {
  RESUME_DATA,
  resumeEmployers,
} from "@interview-week/lib/monday/employers"
import { finish } from "@interview-week/lib/monday/finish"
import { addDays, pacificDay } from "@some-ui/core-utils"
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

const root = (): string =>
  execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim()

async function filesIn(dir: string): Promise<Array<MailboxFile>> {
  const names = await readdir(dir).catch(() => [])
  return Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map(async (name) => ({ name, body: await readJson(join(dir, name)) }))
  )
}

/** `brief`'s interview weeks, and the command that reads the last week's epics. */
async function pull(dir: string): Promise<void> {
  const mailbox = mailboxFromEnv()
  await mkdir(join(dir, "brief"), { recursive: true })
  let count = 0
  for (const item of await list(mailbox, "brief")) {
    if (!WEEK_FILE.test(item.name)) continue
    await writeFile(
      join(dir, "brief", item.name),
      json(await get(mailbox, "brief", item))
    )
    count += 1
  }
  const to = addDays(pacificDay(new Date()), -1)
  console.log(
    [
      `pulled ${count} interview weeks`,
      "now read the epics that moved in the last week:",
      `pnpm --filter @some-ui/video-render render call-facts --from ${addDays(to, -6)} --to ${to} > ${join(dir, "facts.json")}`,
    ].join("\n")
  )
}

const FactsSchema = z.looseObject({
  epics: z.array(
    z.looseObject({
      repo: z.enum(["some-ui", "server"]),
      number: z.number(),
      title: z.string(),
      why: z.string().nullable().default(null),
      whereWeAre: z.string().nullable(),
    })
  ),
})

/** Every tracked markdown file of the checkout, by its path. */
async function markdown(top: string): Promise<Array<Doc>> {
  const paths = execFileSync("git", ["-C", top, "ls-files", "-z", "*.md"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((p) => p !== "" && !p.includes("node_modules/"))
    .sort()
  return Promise.all(
    paths.map(async (path) => ({
      path,
      text: await readFile(join(top, path), "utf8"),
    }))
  )
}

/** What `prepare` makes of the run's folder and the checkout at `now`. */
async function preparedIn(dir: string, now: Date): Promise<Prepared> {
  const facts = FactsSchema.safeParse(
    await readJson(join(dir, "facts.json")).catch(() => {
      // Ignored: a missing or unreadable file is refused just below, saying which command writes it.
      return null
    })
  )
  if (!facts.success) {
    fail([
      `${join(dir, "facts.json")} isn't render call-facts' output: run the command pull printed`,
    ])
  }
  const top = root()
  const docs = await markdown(top)
  return prepare({
    now,
    brief: await filesIn(join(dir, "brief")),
    corpus: {
      calls: callsOf(await readFile(join(top, "docs/calls.json"), "utf8")),
      epics: epicsOf(facts.data.epics),
      docs: docsOf(docs),
      invariants: invariantsOf(docs),
    },
  })
}

async function prepareIn(dir: string, now: Date): Promise<void> {
  const { bundle } = await preparedIn(dir, now)
  await writeFile(join(dir, "bundle.json"), json(bundle))
  console.log(
    [
      `next week: ${bundle.next?.id ?? "already in the mailbox"}`,
      ...(bundle.next === null
        ? []
        : [
            `questions: ${bundle.next.questions.map((q) => q.id).join(", ")}`,
            `cards: ${bundle.next.cards.map((c) => c.id).join(", ")}`,
          ]),
      ...bundle.unread.map((u) => `unread: ${u.name}, ${u.why}`),
    ].join("\n")
  )
}

/**
 * The bundle `prepare` wrote is made again from the same folder, checkout
 * and moment, so `finish` builds from code's choices, never from a bundle
 * edited since.
 */
async function finishIn(dir: string): Promise<void> {
  const held = z
    .object({ now: z.iso.datetime() })
    .safeParse(await readJson(join(dir, "bundle.json")))
  if (!held.success) fail(["bundle.json isn't prepare's: run prepare again"])
  const { bundle } = await preparedIn(dir, new Date(held.data.now))
  if (json(bundle) !== (await readFile(join(dir, "bundle.json"), "utf8"))) {
    fail(["bundle.json changed since prepare wrote it: run prepare again"])
  }
  const finished = finish({
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
  for (const file of finished.files) {
    await writeFile(join(dir, "out", file.name), json(file.body))
  }
  console.log(
    finished.files.length === 0
      ? "ready: nothing to put"
      : ["ready:", ...finished.files.map((f) => `- ${f.name}`)].join("\n")
  )
}

/** Puts every file `finish` wrote into `brief`. */
async function putFrom(dir: string): Promise<void> {
  const mailbox = mailboxFromEnv()
  const lines: Array<string> = []
  let failed = false
  for (const file of await filesIn(join(dir, "out"))) {
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
