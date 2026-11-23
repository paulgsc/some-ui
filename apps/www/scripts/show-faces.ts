// The landing show's faces for one episode (C1183), made from a rendered
// walkthrough or promo: each still the show names copied from the render's
// `snips/`, and each cut taken from its `video.mp4` by shot
// (`shot-times.json`), silent, into a Site Assets folder laid out by key
// (apps/www/src/landing/show.ts, `faceKey`). Run by Snips Capture's apk-clip
// job (android) and Site Assets' extensions job (extensions).
//
//   tsx scripts/show-faces.ts <episode> <render folder> <site-assets folder>
//
// Needs ffmpeg and ffprobe on the path. A face the render lacks fails the
// run: the producer's own output, not the landing, is where that shows.

import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { EpisodeId } from "@/landing/show"
import { facesToMake, SHOW } from "@/landing/show"

const EPISODES: ReadonlyArray<EpisodeId> = ["extensions", "android", "server"]
const args = process.argv.slice(2)
const [episode, renderDir, outDir] = [args.at(0), args.at(1), args.at(2)]
const known = EPISODES.find((id) => id === episode)
if (known === undefined || renderDir === undefined || outDir === undefined) {
  throw new Error(
    "usage: tsx scripts/show-faces.ts <episode> <render folder> <site-assets folder>"
  )
}
const render = resolve(renderDir)
const out = resolve(outDir)
const { stills, cuts } = facesToMake(SHOW, known)

// A tiny poster is optional. Keep the original asset if the encoder fails.
function makePreview(file: string): void {
  const preview = `${file}.preview.webp`
  const result = spawnSync("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale=40:40:force_original_aspect_ratio=decrease:flags=area",
    "-c:v",
    "libwebp",
    "-quality",
    "45",
    preview,
  ])
  if (result.status === 0) return
  rmSync(preview, { force: true })
  process.stderr.write(`[show-faces] no preview for ${file}\n`)
}

for (const { snip, key } of stills) {
  const target = join(out, key)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(
    join(render, "snips", `${String(snip).padStart(2, "0")}.png`),
    target
  )
  makePreview(target)
  process.stdout.write(`[show-faces] ${key}: still ${String(snip)}\n`)
}

const times: unknown =
  cuts.length === 0
    ? []
    : JSON.parse(readFileSync(join(render, "shot-times.json"), "utf8"))
const timeOf = (shot: string): { startMs: number; durationMs: number } => {
  const found = Array.isArray(times)
    ? times.find(
        (t: unknown) =>
          typeof t === "object" && t !== null && "id" in t && t.id === shot
      )
    : undefined
  if (
    typeof found !== "object" ||
    found === null ||
    !("startMs" in found) ||
    typeof found.startMs !== "number" ||
    !("durationMs" in found) ||
    typeof found.durationMs !== "number"
  ) {
    throw new Error(`the render has no shot "${shot}" in shot-times.json`)
  }
  return { startMs: found.startMs, durationMs: found.durationMs }
}

for (const { shot, key } of cuts) {
  const { startMs, durationMs } = timeOf(shot)
  const target = join(out, key)
  mkdirSync(dirname(target), { recursive: true })
  // Re-encoded, so the cut starts on its own frame; no sound track (C1064).
  execFileSync("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(startMs / 1000),
    "-t",
    String(durationMs / 1000),
    "-i",
    join(render, "video.mp4"),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "26",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    target,
  ])
  const sound = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a",
    "-show_entries",
    "stream=index",
    "-of",
    "csv=p=0",
    target,
  ])
    .toString()
    .trim()
  if (sound !== "") throw new Error(`${key} still has a sound track`)
  makePreview(target)
  process.stdout.write(`[show-faces] ${key}: shot ${shot}\n`)
}
