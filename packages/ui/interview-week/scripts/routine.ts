/**
 * What the interview week's two routine commands share (`./monday.ts`, the
 * week; `./essay.ts`, the essay on the week that ended): the checkout's root,
 * the bundle made again so `finish` never builds from one edited since, the
 * files `finish` writes to `out`, their put into `brief`, and the four
 * subcommands.
 */
import { execFileSync } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import {
  fail,
  here,
  jsonFilesIn,
  jsonText,
  mailboxFromEnv,
  put,
  readJson,
  Refused,
  runCommand,
} from "@some-ui/video-render/node"
import { z } from "zod"

export const root = (): string =>
  execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim()

/** The bundle `prepare` wrote, made again by `remake` from its moment; refused if it changed. */
export async function remadeBundle<B>(
  dir: string,
  remake: (now: Date) => Promise<B>
): Promise<B> {
  const held = z
    .object({ now: z.iso.datetime() })
    .safeParse(await readJson(join(dir, "bundle.json")))
  if (!held.success) fail(["bundle.json isn't prepare's: run prepare again"])
  const bundle = await remake(new Date(held.data.now))
  if (jsonText(bundle) !== (await readFile(join(dir, "bundle.json"), "utf8")))
    fail(["bundle.json changed since prepare wrote it: run prepare again"])
  return bundle
}

/** `finish`'s answer: every file it made, written to `<dir>/out`, or every problem. */
export async function writeOut(
  dir: string,
  finished:
    | {
        readonly ok: true
        readonly files: ReadonlyArray<{ name: string; body: unknown }>
      }
    | { readonly ok: false; readonly problems: ReadonlyArray<string> }
): Promise<void> {
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

/** Puts every file `finish` wrote into `brief`. */
async function putOut(dir: string): Promise<void> {
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

/** Runs `name`'s subcommand from the command line: pull, prepare, finish or put. */
export function routineCommand(
  name: string,
  steps: {
    readonly pull: (dir: string) => Promise<void>
    readonly prepare: (dir: string, now: Date) => Promise<void>
    readonly finish: (dir: string) => Promise<void>
  }
): Promise<void> {
  const usage = [
    `usage: ${name} pull --to <dir>`,
    `       ${name} prepare --from <dir> [--now <instant>]`,
    `       ${name} finish --from <dir>`,
    `       ${name} put --from <dir>`,
  ]
  return runCommand(async () => {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: {
        to: { type: "string" },
        from: { type: "string" },
        now: { type: "string" },
      },
    })
    const [command] = positionals
    const from = (): string => {
      if (values.from === undefined) fail(usage)
      return here(values.from)
    }
    switch (command) {
      case "pull": {
        if (values.to === undefined) fail(usage)
        return steps.pull(here(values.to))
      }
      case "prepare": {
        const now = values.now === undefined ? new Date() : new Date(values.now)
        if (Number.isNaN(now.getTime()))
          fail([`--now ${values.now ?? ""} isn't an instant`])
        return steps.prepare(from(), now)
      }
      case "finish": {
        return steps.finish(from())
      }
      case "put": {
        return putOut(from())
      }
      default: {
        throw new Refused(usage.join("\n"))
      }
    }
  })
}
