/**
 * The renderer's ports on Node: ffmpeg and ffprobe from `PATH`, the file
 * system, all inside one video's folder.
 */

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve as resolvePath } from "node:path"
import { z } from "zod"

import { parseCutList } from "./cut-list"
import type { SourceFacts } from "./plan"
import { render } from "./render"
import type { Ports, Rendered, RenderOptions } from "./render"
import { parseSeries } from "./series"

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
  }
}

/**
 * Renders `<root>/cut-list.json` under the series in `seriesFile`, the
 * video's burn-ins drawn by `recordBurnIn` when one is given.
 */
export async function renderFolder(
  root: string,
  seriesFile: string,
  options: RenderOptions & { readonly recordBurnIn?: Ports["recordBurnIn"] }
): Promise<Rendered> {
  const readJson = async (file: string): Promise<unknown> =>
    JSON.parse(await readFile(file, "utf8"))
  const series = parseSeries(await readJson(seriesFile))
  if (!series.ok)
    return {
      ok: false,
      problems: ["The series can't be read:", ...series.problems],
    }
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
  const { recordBurnIn, ...rest } = options
  return render(
    cutList.value,
    series.value,
    { ...nodePorts(root), ...(recordBurnIn ? { recordBurnIn } : {}) },
    rest
  )
}
