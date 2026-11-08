/**
 * The renderer's ports on Node: ffmpeg and ffprobe from `PATH`, the file
 * system, all inside one video's folder.
 */

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { join, resolve as resolvePath } from "node:path"
import { z } from "zod"

import { parseCutList } from "./cut-list"
import type { Parsed } from "./cut-list"
import { parseFormat } from "./format"
import type { Format } from "./format"
import type { SourceFacts } from "./plan"
import { DEFAULT_POLICY } from "./policy"
import { render } from "./render"
import type { Ports, Rendered, RenderOptions } from "./render"
import { parseSeries, versionFile, versionOfFile } from "./series"
import type { Series } from "./series"
import {
  stepCache,
  withCachedBurnIns,
  withCachedCompositions,
  withCachedFfmpeg,
} from "./step-cache"

type Ran = {
  readonly ok: boolean
  readonly stdout: Buffer
  readonly stderr: string
}

function run(
  cmd: "ffmpeg" | "ffprobe",
  args: ReadonlyArray<string>,
  cwd: string
): Promise<Ran> {
  return new Promise((done, fail) => {
    execFile(
      cmd,
      [...args],
      { cwd, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && "code" in error && error.code === "ENOENT") {
          fail(new Error(`${cmd} isn't installed, or isn't on PATH`))
          return
        }
        done({ ok: !error, stdout, stderr: stderr.toString("utf8") })
      }
    )
  })
}

/** The JSON ffprobe prints, or null when it printed something else. */
function json<T>(schema: z.ZodType<T>, out: Buffer): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(out.toString("utf8")))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const number = z.coerce.number().refine(Number.isFinite)

const ProbeSchema = z.object({
  streams: z
    .array(
      z.object({
        codec_type: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
      })
    )
    .default([]),
  format: z.object({ duration: number.optional() }).default({}),
})

const FramesSchema = z.object({
  streams: z
    .array(z.object({ nb_read_frames: number, avg_frame_rate: z.string() }))
    .min(1),
})

/**
 * A file's length when its container doesn't say, as a phone's recorded
 * WebM doesn't: its audio's length once decoded, or its frames counted. A
 * still image counts one frame.
 */
async function decodedMs(
  file: string,
  hasAudio: boolean,
  cwd: string
): Promise<number | null> {
  if (hasAudio) {
    const ran = await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-i",
        file,
        "-f",
        "s16le",
        "-ac",
        "1",
        "-ar",
        "8000",
        "-",
      ],
      cwd
    )
    return ran.ok ? Math.round(ran.stdout.length / 16) : null
  }
  const ran = await run(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames,avg_frame_rate",
      "-of",
      "json",
      file,
    ],
    cwd
  )
  const stream = ran.ok ? json(FramesSchema, ran.stdout)?.streams[0] : null
  if (!stream) return null
  const [n, d] = stream.avg_frame_rate.split("/").map(Number)
  return n && d ? Math.round((stream.nb_read_frames * 1000 * d) / n) : 0
}

export function nodePorts(root: string): Ports {
  const at = (file: string): string => resolvePath(root, file)
  return {
    ffmpeg: async (call): Promise<{ ok: boolean; stderr: string }> => {
      const ran = await run("ffmpeg", call.args, root)
      return { ok: ran.ok, stderr: ran.stderr }
    },
    probe: async (file): Promise<SourceFacts | null> => {
      const ran = await run(
        "ffprobe",
        [
          "-v",
          "error",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          file,
        ],
        root
      )
      const info = ran.ok ? json(ProbeSchema, ran.stdout) : null
      if (!info) return null
      const video = info.streams.find((s) => s.codec_type === "video")
      const audio = info.streams.some((s) => s.codec_type === "audio")
      const seconds = info.format.duration
      const durationMs =
        seconds === undefined
          ? await decodedMs(file, audio, root)
          : Math.round(seconds * 1000)
      if (durationMs === null) return null
      return {
        width: video?.width ?? 0,
        height: video?.height ?? 0,
        durationMs,
      }
    },
    sha256: (file) =>
      new Promise((done) => {
        const hash = createHash("sha256")
        createReadStream(at(file))
          .on("data", (chunk) => hash.update(chunk))
          .on("error", () => done(null))
          .on("end", () => done(hash.digest("hex")))
      }),
    mkdir: async (dir): Promise<void> => {
      await mkdir(at(dir), { recursive: true })
    },
    writeFile: (file, text) => writeFile(at(file), text),
    fileBytes: async (file): Promise<number | null> => {
      try {
        return (await stat(at(file))).size
      } catch {
        return null
      }
    },
    remove: async (file): Promise<void> => {
      await rm(at(file), { force: true })
    },
  }
}

export { keyOf, stepCache } from "./step-cache"
export type { StepCache } from "./step-cache"

/** ffmpeg's version line, the part of a step's key that names the tool. */
export async function ffmpegVersion(cwd: string): Promise<string> {
  const ran = await run("ffmpeg", ["-version"], cwd)
  return ran.stdout.toString("utf8").split("\n")[0] ?? ""
}

export const readJson = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(file, "utf8"))

/**
 * One version of a versioned file in `dir` (`v<n>.json`, `series.ts`): the
 * one asked for, or the newest when none is. Refuses a file that is
 * missing, unreadable, or another version than its name says.
 */
async function readVersioned<T extends { readonly version: number }>(
  dir: string,
  what: string,
  parse: (raw: unknown) => Parsed<T>,
  version?: number
): Promise<Parsed<T>> {
  const versions = (await readdir(dir).catch(() => []))
    .map(versionOfFile)
    .filter((v) => v !== null)
  const wanted = version ?? Math.max(0, ...versions)
  if (!versions.includes(wanted)) {
    return {
      ok: false,
      problems: [
        version === undefined
          ? `${dir} holds no version of a ${what}`
          : `${dir} holds no version ${version} of its ${what}`,
      ],
    }
  }
  let raw: unknown
  try {
    raw = await readJson(join(dir, versionFile(wanted)))
  } catch (e) {
    return {
      ok: false,
      problems: [`${versionFile(wanted)} can't be read: ${String(e)}`],
    }
  }
  const parsed = parse(raw)
  if (!parsed.ok)
    return {
      ok: false,
      problems: [`The ${what} can't be read:`, ...parsed.problems],
    }
  if (parsed.value.version !== wanted) {
    return {
      ok: false,
      problems: [
        `${versionFile(wanted)} says it is version ${parsed.value.version}`,
      ],
    }
  }
  return parsed
}

/** One version of the series in `dir`, or the newest (`readVersioned`). */
export const readSeries = (
  dir: string,
  version?: number
): Promise<Parsed<Series>> => readVersioned(dir, "series", parseSeries, version)

/** One version of a show's format in `dir`, or the newest (`format.ts`). */
export const readFormat = (
  dir: string,
  version?: number
): Promise<Parsed<Format>> => readVersioned(dir, "format", parseFormat, version)

/**
 * Renders `<root>/cut-list.json` under the version of the series in
 * `seriesDir` it pins, the video's burn-ins drawn by `recordBurnIn` when
 * one is given, after `checkBurnIns` finds no two of them in one place.
 */
export async function renderFolder(
  root: string,
  seriesDir: string,
  options: RenderOptions &
    Partial<Pick<Ports, "recordBurnIn" | "checkBurnIns" | "compositions">> & {
      /**
       * Keep each ffmpeg step, each burn-in recorded and each composition
       * drawn under this folder,
       * relative to `root`, so a retry runs only what changed; held to
       * `policy.cacheBytes`.
       */
      readonly stepCacheDir?: string
      /** Where a step not kept, over the cache's budget, is said. */
      readonly warn?: (line: string) => void
    }
): Promise<Rendered> {
  const cutList = parseCutList(await readJson(join(root, "cut-list.json")))
  if (!cutList.ok) {
    return {
      ok: false,
      problems: [
        "The cut list can't be rendered as written:",
        ...cutList.problems,
      ],
    }
  }
  const series = await readSeries(seriesDir, cutList.value.series.version)
  if (!series.ok) return series
  const {
    recordBurnIn,
    checkBurnIns,
    compositions,
    stepCacheDir,
    warn,
    ...rest
  } = options
  const own: Ports = {
    ...nodePorts(root),
    ...(recordBurnIn ? { recordBurnIn } : {}),
    ...(checkBurnIns ? { checkBurnIns } : {}),
    ...(compositions ? { compositions } : {}),
  }
  let version: Promise<string> | null = null
  const cache = stepCacheDir
    ? stepCache(
        resolvePath(root, stepCacheDir),
        rest.policy ?? DEFAULT_POLICY,
        warn ??
          ((line): void => {
            process.stderr.write(`${line}\n`)
          })
      )
    : null
  const ports = cache
    ? withCachedCompositions(
        withCachedBurnIns(
          withCachedFfmpeg(
            own,
            root,
            cache,
            (): Promise<string> => (version ??= ffmpegVersion(root))
          ),
          root,
          cache
        ),
        root,
        cache
      )
    : own
  return render(cutList.value, series.value, ports, rest)
}

/**
 * The folder every show's format is pinned in, one folder per format
 * (`templates.ts`): the call's and Playoff Delta's, whose tests read their
 * pins here.
 */
export const TEMPLATES_DIR = join(import.meta.dirname, "templates")

/** A path from where the command was typed (`pnpm --filter` sets INIT_CWD). */
export const here = (p: string): string =>
  resolvePath(process.env["INIT_CWD"] ?? process.cwd(), p)

/** Stops a command, saying why; `runCommand` prints it and sets the exit code. */
export class Refused extends Error {}

export function fail(lines: ReadonlyArray<string>): never {
  throw new Refused(lines.join("\n"))
}

/** Runs `main`, printing a refusal's reasons rather than a stack. */
export async function runCommand(main: () => Promise<void>): Promise<void> {
  try {
    await main()
  } catch (e) {
    if (!(e instanceof Refused)) throw e
    process.stderr.write(`${e.message}\n`)
    process.exitCode = 1
  }
}
