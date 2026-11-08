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
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { nodePorts } from "@some-ui/video-render/node"
import { z } from "zod"

import { isHeadlessShell } from "./browser"
import { fontFiles } from "./fonts"
import {
  chromeWrapper,
  encodeArgs,
  fetched,
  HYPERFRAMES_VERSION,
  renderArgs,
  renderEnv,
} from "./pin"

const require = createRequire(import.meta.url)

const ManifestSchema = z.object({ version: z.string() })

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The workspace's compositions, one folder each. `_lib` is what they share,
 * copied into every render as `lib/`, and is not one.
 */
export const COMPOSITIONS = resolve(HERE, "../compositions")
export const LIB = "_lib"

/** The brand's mark, copied into every render as `brand/mark.svg`. */
export const MARK = resolve(HERE, "../../some-styles/brand/favicon.svg")

/** The root element's opening tag, as the composition's markup writes it. */
const ROOT = /<[^>]*\bdata-composition-id="main"[^>]*>/

/** A number attribute of the root's tag, or 0 when it has none. */
const attribute = (tag: string, name: string): number =>
  Number(new RegExp(`\\b${name}="([\\d.]+)"`).exec(tag)?.[1] ?? 0)

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
  /** The Chromium headless shell to draw with (`browser.ts`). */
  readonly chrome: string
  /** The scene's length, over the composition's own `data-duration`. */
  readonly seconds?: number
  /** The video's frame, which the composition's own size must be. */
  readonly frame?: { readonly width: number; readonly height: number }
  /** Files the composition reads, copied in under `assets/`. */
  readonly assets?: ReadonlyArray<{
    readonly from: string
    readonly as: string
  }>
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
  return runCommand(process.execPath, args, env)
}

function runCommand(
  command: string,
  args: ReadonlyArray<string>,
  env: Record<string, string>
): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(command, [...args], {
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
  if (!isHeadlessShell(request.chrome)) {
    return {
      ok: false,
      problem: `${request.chrome} is not a Chromium headless shell, the only browser that draws with DRAW_FLAGS (browser.ts)`,
    }
  }
  const source = join(COMPOSITIONS, request.composition)
  const entries = await readdir(COMPOSITIONS)
  if (request.composition === LIB || !entries.includes(request.composition)) {
    return {
      ok: false,
      problem: `there is no composition named ${request.composition}`,
    }
  }
  const work = resolve(request.work)
  const project = join(work, "project")
  const frames = join(work, "frames")
  const variables = join(work, "variables.json")
  await rm(work, { recursive: true, force: true })
  await mkdir(join(project, "fonts"), { recursive: true })
  await mkdir(join(work, "tmp"), { recursive: true })
  // The work drive's tmp, by a short path (renderEnv says why).
  let link: string | null = null
  try {
    link = await mkdtemp(join(tmpdir(), "hf-"))
    const tmp = join(link, "t")
    await symlink(join(work, "tmp"), tmp)
    await cp(source, project, { recursive: true })
    await cp(join(COMPOSITIONS, LIB), join(project, "lib"), { recursive: true })
    await cp(MARK, join(project, "brand", "mark.svg"))
    for (const [name, file] of fontFiles()) {
      await cp(file, join(project, "fonts", name))
    }
    for (const asset of request.assets ?? []) {
      await cp(asset.from, join(project, "assets", asset.as))
    }
    const index = join(project, "index.html")
    const html = await readFile(index, "utf8")
    const root = ROOT.exec(html)?.[0] ?? ""
    const [width, height] = [
      attribute(root, "data-width"),
      attribute(root, "data-height"),
    ]
    const frame = request.frame
    if (frame && (width !== frame.width || height !== frame.height)) {
      return {
        ok: false,
        problem: `${request.composition} is drawn ${String(width)}x${String(height)}, and the video is ${String(frame.width)}x${String(frame.height)}`,
      }
    }
    if (request.seconds !== undefined) {
      if (!/\bdata-duration="/.test(root)) {
        return {
          ok: false,
          problem: `${request.composition} has no root data-duration to set`,
        }
      }
      const seconds = String(request.seconds)
      await writeFile(
        index,
        html.replace(
          root,
          root.replace(/\bdata-duration="[^"]*"/, `data-duration="${seconds}"`)
        )
      )
    }
    await writeFile(variables, JSON.stringify(request.variables))
    const chrome = join(work, "chrome")
    await writeFile(chrome, chromeWrapper(request.chrome))
    await chmod(chrome, 0o755)
    const env = renderEnv(process.env, chrome, tmp)
    const runs = await runCommand(chrome, ["--version"], env)
    if (!runs.ok) {
      return {
        ok: false,
        problem: `the browser can't be started from ${work}, where its wrapper is written (a drive mounted noexec?): ${lastLines(runs.output)}`,
      }
    }
    const drawn = await runNode(
      [
        await hyperframesBin(),
        ...renderArgs({ project, frames, variables, fps: request.fps }),
      ],
      env
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
    const asked =
      request.seconds === undefined
        ? null
        : Math.round(request.seconds * request.fps)
    if (count === 0 || (asked !== null && count !== asked)) {
      return {
        ok: false,
        problem: `HyperFrames drew ${String(count)} frames of ${request.composition}${asked === null ? "" : `, not the ${String(asked)} asked for`}`,
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
    if (link) await rm(link, { recursive: true, force: true })
    await rm(work, { recursive: true, force: true })
  }
}
