// The landing show's faces for one episode (C1183), made from a rendered
// walkthrough or promo: each still the show names copied from the render's
// `snips/`, and each cut taken from its `video.mp4` by shot
// (`shot-times.json`), silent, into a Site Assets folder laid out by key
// (apps/www/src/landing/show.ts, `faceKey`). Run by Snips Capture's apk-clip
// job (android) and Site Assets' extensions job (extensions).
//
//   tsx scripts/show-faces.ts <episode> <render folder> <site-assets folder> [<snips bundle>]
//
// From the Snips Capture bundle (docs/snips.md), which it needs whenever
// the episode names route stills, it copies each route's still the show
// names (a `screen` face, #3473) from the bundle's APK pictures, the
// release build's where it has one. A route the show names
// that the capture did not photograph is a warning on the run (below).
//
// Beside each face it writes the face's preview (`previewKey`): a still
// itself, or a clip's middle frame (a cut opens on its fade in), 40 px on its long edge, as WebP, which the landing shows in the
// face's aperture until the face's own media can be (#3470 §4; the build
// serves it within PREVIEW_BUDGET).
//
// Needs ffmpeg and ffprobe on the path. A face the render lacks fails the
// run: the producer's own output, not the landing, is where that shows.

import { execFileSync } from "node:child_process"
import { appendFileSync, copyFileSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { previewKey } from "@/landing/render"
import type { EpisodeId } from "@/landing/show"
import { facesToMake, SHOW } from "@/landing/show"

const EPISODES: ReadonlyArray<EpisodeId> = ["extensions", "android", "server"]
const args = process.argv.slice(2)
const [episode, renderDir, outDir, bundleDir] = [
  args.at(0),
  args.at(1),
  args.at(2),
  args.at(3),
]
const known = EPISODES.find((id) => id === episode)
if (known === undefined || renderDir === undefined || outDir === undefined) {
  throw new Error(
    "usage: tsx scripts/show-faces.ts <episode> <render folder> <site-assets folder> [<snips bundle>, needed when the episode names route stills]"
  )
}
const render = resolve(renderDir)
const out = resolve(outDir)
const { stills, cuts, screens } = facesToMake(SHOW, known)

/** A face's preview beside it: its frame at `atS` seconds, 40 px on the long edge. */
function makePreview(file: string, key: string, atS = 0): void {
  execFileSync("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(atS),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale=40:40:force_original_aspect_ratio=decrease:flags=area",
    "-c:v",
    "libwebp",
    "-quality",
    "50",
    join(out, previewKey(key)),
  ])
}

for (const { snip, key } of stills) {
  const target = join(out, key)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(
    join(render, "snips", `${String(snip).padStart(2, "0")}.png`),
    target
  )
  makePreview(target, key)
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
  makePreview(target, key, durationMs / 2000)
  process.stdout.write(`[show-faces] ${key}: shot ${shot}\n`)
}

/** A record of the bundle's manifest, as far as this script reads it. */
type Picture = {
  readonly route: string
  readonly build: string
  readonly name: string
}

/** The bundle's APK pictures, by route, from its manifest (docs/snips.md). */
function apkPictures(bundle: string): ReadonlyArray<Picture> {
  const manifest: unknown = JSON.parse(
    readFileSync(join(bundle, "manifest.json"), "utf8")
  )
  const snips =
    typeof manifest === "object" && manifest !== null && "snips" in manifest
      ? manifest.snips
      : undefined
  if (!Array.isArray(snips)) throw new Error(`${bundle} has no snips`)
  return snips.flatMap((snip: unknown): ReadonlyArray<Picture> => {
    if (typeof snip !== "object" || snip === null) return []
    if (!("surface" in snip) || snip.surface !== "apk") return []
    if (!("route" in snip) || typeof snip.route !== "string") return []
    if (!("build" in snip) || typeof snip.build !== "string") return []
    const image = "image" in snip ? snip.image : undefined
    if (typeof image !== "object" || image === null) return []
    if (!("name" in image) || typeof image.name !== "string") return []
    return [{ route: snip.route, build: snip.build, name: image.name }]
  })
}

// A route the show names that the capture didn't photograph is called out
// loudly, as a warning on the run and in its summary (#3473), but doesn't
// fail it: a red run would cost far more than the face. Pages and home read
// only green Snips Capture runs (fetch-site-media.sh, docs/snips.md), so
// failing here would drop this run's Jobs faces and every essay's snips for
// one missing still. The face shows its title card until a capture has it.
// A run given no bundle at all is a mistake in how it was called, and fails.
if (screens.length > 0) {
  if (bundleDir === undefined)
    throw new Error(
      `the show names ${String(screens.length)} route stills, and no snips bundle was given`
    )
  const bundle = resolve(bundleDir)
  const pictures = apkPictures(bundle)
  const missing = screens.filter(
    ({ route }) => !pictures.some((p) => p.route === route)
  )
  for (const { route, key } of missing) {
    const line = `The landing names ${route}, which this capture did not photograph (see the manifest's \`unreached\`): ${key} shows its title card.`
    // A workflow command's data escapes %, CR and LF.
    const data = line
      .replaceAll("%", "%25")
      .replaceAll("\r", "%0D")
      .replaceAll("\n", "%0A")
    process.stdout.write(`::warning title=Landing faces::${data}\n`)
    const summary = process.env["GITHUB_STEP_SUMMARY"]
    if (summary !== undefined && summary !== "")
      appendFileSync(summary, `- ${line}\n`)
  }
  for (const { route, key } of screens) {
    const found =
      pictures.find((p) => p.route === route && p.build === "release") ??
      pictures.find((p) => p.route === route)
    if (found === undefined) continue
    const target = join(out, key)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(bundle, found.name), target)
    makePreview(target, key)
    process.stdout.write(`[show-faces] ${key}: ${route} (${found.build})\n`)
  }
}
