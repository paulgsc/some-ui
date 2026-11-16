/**
 * The interview week's Monday routine (IW4, paulgsc/some-ui#2935): `pull`,
 * `prepare`, `finish` and `put`. `ROUTINE.md` says when each runs; the model
 * only writes the values file between `prepare` and `finish`.
 */
import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Prepared } from "@interview-week/lib/monday/bundle"
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
import { factsWindow } from "@interview-week/lib/monday/window"
import { pacificDay } from "@some-ui/core-utils"
import { callsInTree } from "@some-ui/eslint-kit/calls"
import type { Call } from "@some-ui/eslint-kit/calls"
import {
  fail,
  get,
  jsonFilesIn,
  jsonText,
  list,
  mailboxFromEnv,
  readJson,
} from "@some-ui/video-render/node"
import { z } from "zod"

import { remadeBundle, root, routineCommand, writeOut } from "./routine"

/** `brief`'s interview weeks, and the command that reads the last week's epics. */
async function pull(dir: string): Promise<void> {
  const mailbox = mailboxFromEnv()
  await mkdir(join(dir, "brief"), { recursive: true })
  let count = 0
  for (const item of await list(mailbox, "brief")) {
    if (!WEEK_FILE.test(item.name)) continue
    await writeFile(
      join(dir, "brief", item.name),
      jsonText(await get(mailbox, "brief", item))
    )
    count += 1
  }
  const { from, to } = factsWindow(pacificDay(new Date()))
  console.log(
    [
      `pulled ${count} interview weeks`,
      "now read the epics that moved in the last week:",
      `pnpm --filter @some-ui/video-render render call-facts --from ${from} --to ${to} > ${join(dir, "facts.json")}`,
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

/** The calls record in the checkout at `top`, through its one loader. */
function recordIn(top: string): ReadonlyArray<Call> {
  const record = callsInTree(top)
  if (record.layout === "none")
    return fail([`${top} holds no calls record: run from some-ui's main`])
  if (record.calls === null)
    return fail([
      `the calls record in ${top} can't be read: pnpm check:calls says why`,
    ])
  return record.calls
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
    brief: await jsonFilesIn(join(dir, "brief")),
    corpus: {
      calls: callsOf(recordIn(top)),
      epics: epicsOf(facts.data.epics),
      docs: docsOf(docs),
      invariants: invariantsOf(docs),
    },
  })
}

async function prepareIn(dir: string, now: Date): Promise<void> {
  const { bundle } = await preparedIn(dir, now)
  await writeFile(join(dir, "bundle.json"), jsonText(bundle))
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

/** `finish` builds from the bundle made again, never from one edited since (`remadeBundle`). */
async function finishIn(dir: string): Promise<void> {
  const bundle = await remadeBundle(
    dir,
    async (now) => (await preparedIn(dir, now)).bundle
  )
  await writeOut(
    dir,
    finish({
      bundle,
      values: await readJson(join(dir, "values.json")),
      resumeEmployers: resumeEmployers(
        await readFile(join(root(), RESUME_DATA), "utf8")
      ),
    })
  )
}

await routineCommand("monday", {
  pull,
  prepare: prepareIn,
  finish: finishIn,
})
