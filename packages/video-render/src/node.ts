/**
 * The renderer's ports on Node: ffmpeg and ffprobe from `PATH`, the file
 * system, all inside one video's folder. Home's worker (GWB10) and a
 * session use these; a test can swap any of them.
 */

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve as resolvePath } from "node:path"

import type { SourceFacts } from "./plan"
import type { Ports } from "./render"

type Ran = {
  readonly ok: boolean
  readonly stdout: Buffer
  readonly stderr: string
}

function run(
  cmd: string,
  args: ReadonlyArray<string>,
  cwd: string
): Promise<Ran> {
  return new Promise((done) => {
    execFile(
      cmd,
      [...args],
      { cwd, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
      (error, stdout, stderr) =>
        done({ ok: !error, stdout, stderr: stderr.toString("utf8") })
    )
  })
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

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
  if (!ran.ok) return null
  const stream: unknown = Reflect.get(
    Object(
      Reflect.get(Object(JSON.parse(ran.stdout.toString("utf8"))), "streams")
    ),
    0
  )
  const count = num(Reflect.get(Object(stream), "nb_read_frames"))
  const [n, d] = String(Reflect.get(Object(stream), "avg_frame_rate"))
    .split("/")
    .map(Number)
  if (count === null) return null
  return n && d ? Math.round((count * 1000 * d) / n) : 0
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
      if (!ran.ok) return null
      let info: unknown
      try {
        info = JSON.parse(ran.stdout.toString("utf8"))
      } catch {
        return null
      }
      const streams: unknown = Reflect.get(Object(info), "streams")
      const of = (type: string): unknown =>
        Array.isArray(streams)
          ? streams.find((s) => Reflect.get(Object(s), "codec_type") === type)
          : undefined
      const video = of("video")
      const seconds = num(
        Reflect.get(Object(Reflect.get(Object(info), "format")), "duration")
      )
      const durationMs =
        seconds === null
          ? await decodedMs(file, of("audio") !== undefined, root)
          : Math.round(seconds * 1000)
      if (durationMs === null) return null
      return {
        width: num(Reflect.get(Object(video), "width")) ?? 0,
        height: num(Reflect.get(Object(video), "height")) ?? 0,
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
