/**
 * Renders one composition to one lossless clip, the same bytes every time
 * for the same composition, variables and pins (HYPER1, paulgsc/some-ui#2724).
 *
 * The composition's folder is copied first: HyperFrames writes into the
 * project it renders (`.hyperframes/`), and on home the repository is in the
 * image, read-only. The copy gets the vendored fonts and the variables, the
 * frames are written beside it, encoded into the clip (`pin.ts`), and
 * everything but the clip is removed.
 */

import { spawn } from "node:child_process"
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { nodePorts } from "@some-ui/video-render/node"
import { z } from "zod"

import { fontFiles } from "./fonts"
import {
  encodeArgs,
  fetched,
  HYPERFRAMES_VERSION,
  renderArgs,
  renderEnv,
} from "./pin"

const require = createRequire(import.meta.url)

const ManifestSchema = z.object({ version: z.string() })

/** The workspace's compositions, one folder each. */
const COMPOSITIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../compositions"
)

export type RenderRequest = {
  /** A folder under `compositions/`. */
  readonly composition: string
  /** Merged over the composition's declared defaults; undeclared ones fail. */
  readonly variables: Readonly<Record<string, unknown>>
  readonly fps: number
  /** The clip to write, an `.mkv`. */
  readonly out: string
  /** A folder of this render's own, on a drive with room for its frames. */
  readonly work: string
  /** The Chromium to draw with. */
  readonly chrome: string
}

export type Rendered =
  | { readonly ok: true }
  | { readonly ok: false; readonly problem: string }

type Ran = { readonly ok: boolean; readonly output: string }

/** The installed HyperFrames' command, refused unless it is the pin. */
async function hyperframesBin(): Promise<string> {
  const manifest = require.resolve("hyperframes/package.json")
  const { version } = ManifestSchema.parse(
    JSON.parse(await readFile(manifest, "utf8"))
  )
  if (version !== HYPERFRAMES_VERSION) {
    throw new Error(
      `hyperframes ${version} is installed, and the pin is ${HYPERFRAMES_VERSION}`
    )
  }
  return join(dirname(manifest), "bin/hyperframes.mjs")
}

function runNode(
  args: ReadonlyArray<string>,
  env: Record<string, string>
): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    const keep = (chunk: Buffer): void => {
      // Its last 64 KB: enough for a reason, never a render's worth of logs.
      output = (output + chunk.toString("utf8")).slice(-65536)
    }
    child.stdout.on("data", keep)
    child.stderr.on("data", keep)
    child.on("error", (error) => {
      done({ ok: false, output: `${output}\n${String(error)}` })
    })
    child.on("close", (code) => {
      done({ ok: code === 0, output })
    })
  })
}

const lastLines = (output: string): string =>
  output.trim().split("\n").slice(-8).join("\n") || "it gave no reason"

export async function renderComposition(
  request: RenderRequest
): Promise<Rendered> {
  const source = join(COMPOSITIONS, request.composition)
  const entries = await readdir(COMPOSITIONS)
  if (!entries.includes(request.composition)) {
    return {
      ok: false,
      problem: `there is no composition named ${request.composition}`,
    }
  }
  const work = resolve(request.work)
  const project = join(work, "project")
  const frames = join(work, "frames")
  const tmp = join(work, "tmp")
  const variables = join(work, "variables.json")
  await rm(work, { recursive: true, force: true })
  await mkdir(join(project, "fonts"), { recursive: true })
  await mkdir(tmp, { recursive: true })
  try {
    await cp(source, project, { recursive: true })
    for (const [name, file] of fontFiles()) {
      await cp(file, join(project, "fonts", name))
    }
    await writeFile(variables, JSON.stringify(request.variables))
    const drawn = await runNode(
      [
        await hyperframesBin(),
        ...renderArgs({ project, frames, variables, fps: request.fps }),
      ],
      renderEnv(process.env, request.chrome, tmp)
    )
    if (!drawn.ok) {
      return {
        ok: false,
        problem: `HyperFrames did not render ${request.composition}: ${lastLines(drawn.output)}`,
      }
    }
    const reached = fetched(drawn.output)
    if (reached.length > 0) {
      return {
        ok: false,
        problem: `${request.composition} reached the network for a font, which home cannot: ${reached.join("; ")}`,
      }
    }
    const count = (await readdir(frames)).filter((f) =>
      /^frame_\d{6}\.png$/.test(f)
    ).length
    if (count === 0) {
      return {
        ok: false,
        problem: `HyperFrames drew no frames of ${request.composition}`,
      }
    }
    await mkdir(dirname(resolve(request.out)), { recursive: true })
    const encoded = await nodePorts(work).ffmpeg({
      args: encodeArgs(frames, request.fps, count, resolve(request.out)),
    })
    if (!encoded.ok) {
      return {
        ok: false,
        problem: `the clip of ${request.composition}: ${lastLines(encoded.stderr)}`,
      }
    }
    return { ok: true }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
