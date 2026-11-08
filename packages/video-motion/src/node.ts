/**
 * `@some-ui/video-render`'s compositions port, drawn here (HYPER2, #2725):
 * a composition scene's picture is its composition rendered for the scene's
 * length, with the files the cut list names copied in beside it.
 */

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Compositions } from "@some-ui/video-render"
import { ffmpegVersion } from "@some-ui/video-render/node"

import { fontFiles } from "./fonts"
import { everyMark } from "./mark"
import { DRAW_FLAGS, HYPERFRAMES_VERSION } from "./pin"
import { COMPOSITIONS, LIB, MARK, renderComposition } from "./render"

/** Every file under `dir`, by its path from `dir`, sorted. */
export async function filesUnder(dir: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
    .sort()
}

/**
 * What decides a composition's bytes besides its request: every file a
 * render copies in (the composition's own, what they share, the mark, the
 * fonts), the HyperFrames pin, the browser that draws it with its switches
 * (`DRAW_FLAGS`), and the ffmpeg that encodes the clip.
 */
async function pinOf(
  ref: string,
  browser: string,
  ffmpeg: string
): Promise<string> {
  const hash = createHash("sha256")
  hash.update(
    `hyperframes ${HYPERFRAMES_VERSION}\n${browser} ${DRAW_FLAGS.join(" ")}\n${ffmpeg}\n`
  )
  // The marks a composition may be given, drawn from the code (HYPER5).
  hash.update(`${everyMark()}\n`)
  const sources: Array<readonly [string, string]> = [
    ["mark", MARK],
    ...fontFiles(),
  ]
  for (const dir of [ref, LIB]) {
    for (const file of await filesUnder(join(COMPOSITIONS, dir))) {
      sources.push([`${dir}/${file}`, join(COMPOSITIONS, dir, file)])
    }
  }
  for (const [name, file] of sources) {
    hash.update(`${name}\n`)
    hash.update(await readFile(file))
  }
  return hash.digest("hex")
}

/** The browser, by its path and the version it says it is. */
const browserOf = (chrome: string): Promise<string> =>
  new Promise((done) => {
    execFile(chrome, ["--version"], (error, stdout) => {
      done(`${chrome} ${error ? "(no version)" : stdout.trim()}`)
    })
  })

/**
 * The port for a video in `root`, drawing with `chrome` in `work`, a folder
 * of its own on a drive with room for a scene's frames.
 */
export function compositionPort(
  root: string,
  chrome: string,
  work: string
): Compositions {
  let ffmpeg: Promise<string> | null = null
  let browser: Promise<string> | null = null
  return {
    pin: async (ref) =>
      pinOf(
        ref,
        await (browser ??= browserOf(chrome)),
        await (ffmpeg ??= ffmpegVersion(root))
      ),
    record: async (r) =>
      renderComposition({
        composition: r.ref,
        variables: r.variables,
        fps: r.frame.fps,
        frame: r.frame,
        seconds: r.frames / r.frame.fps,
        assets: r.files.map((file) => ({
          from: resolve(root, file),
          as: file,
        })),
        out: resolve(root, r.out),
        work,
        chrome,
      }),
  }
}
