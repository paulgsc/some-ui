/**
 * The phone's copies of the weekly call's videos (ST38): one file a week in
 * the app's cache, `call-videos/<from>.mp4`, written a part at a time as
 * home sends it, so a video is never held whole in memory. The cache is the
 * phone's to clear; home keeps the video until the owner lets it go. Every
 * wait on the files is bounded (`callForeign`), and every call resolves.
 * Phone-only (`build.paths.ts`).
 */
import type {
  ForeignOutcome,
  ForeignPort,
  ForeignVerdict,
} from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

import { isMissingPlugin } from "@/lib/intent/foreign"

import type { VideoFiles } from "./runtime"

/** The cache folder the videos are kept in, and shared from. */
export const DIR = "call-videos"

/** Writing one part (a few MB) or reading what is kept. */
const DEADLINE_MS = 60_000

function classify(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "The phone didn't finish keeping the video. Try again.",
    }
  }
  return isMissingPlugin(error)
    ? {
        kind: "unavailable",
        retryable: false,
        summary: "This build of the app can't keep a video.",
      }
    : {
        kind: "unknown",
        retryable: true,
        summary: "The phone couldn't keep the video. Try again.",
      }
}

const PORT: ForeignPort = {
  name: "call videos (filesystem)",
  classify,
  report: reportFailure,
}

const pathOf = (from: string): string => `${DIR}/${from}.mp4`

/** A call's value once it succeeded, `fallback` otherwise. */
const valueOr = <T>(outcome: ForeignOutcome<T>, fallback: T): T =>
  outcome.status === "succeeded" ? outcome.value : fallback

/**
 * The address the web view plays a cached file from, as the native bridge
 * gives it (`Capacitor.convertFileSrc`), read from the `window.Capacitor` it
 * injects, so no build carries `@capacitor/core` for it.
 */
function playable(uri: string, host: object = globalThis): string {
  const capacitor: unknown = Reflect.get(host, "Capacitor")
  if (typeof capacitor !== "object" || capacitor === null) return uri
  const convert: unknown = Reflect.get(capacitor, "convertFileSrc")
  if (typeof convert !== "function") return uri
  const src: unknown = Reflect.apply(convert, capacitor, [uri])
  return typeof src === "string" ? src : uri
}

export const videoFiles: VideoFiles = {
  async size(from) {
    const outcome = await callForeign({
      port: PORT,
      deadlineMs: DEADLINE_MS,
      start: async (): Promise<number | null> => {
        const { Directory, Filesystem } = await import("@capacitor/filesystem")
        try {
          const { size } = await Filesystem.stat({
            path: pathOf(from),
            directory: Directory.Cache,
          })
          return size
        } catch {
          // Ignored: no file is the usual case, a video not fetched yet.
          return null
        }
      },
    }).outcome
    return valueOr(outcome, null)
  },

  async put(from, base64, first) {
    const outcome = await callForeign({
      port: PORT,
      deadlineMs: DEADLINE_MS,
      start: async (): Promise<boolean> => {
        const { Directory, Filesystem } = await import("@capacitor/filesystem")
        const options = {
          path: pathOf(from),
          directory: Directory.Cache,
          data: base64,
        }
        if (first) {
          await Filesystem.writeFile({ ...options, recursive: true })
        } else {
          await Filesystem.appendFile(options)
        }
        return true
      },
    }).outcome
    return valueOr(outcome, false)
  },

  async where(from) {
    const outcome = await callForeign({
      port: PORT,
      deadlineMs: DEADLINE_MS,
      start: async (): Promise<{ uri: string; src: string }> => {
        const { Directory, Filesystem } = await import("@capacitor/filesystem")
        const { uri } = await Filesystem.getUri({
          path: pathOf(from),
          directory: Directory.Cache,
        })
        return { uri, src: playable(uri) }
      },
    }).outcome
    return valueOr(outcome, null)
  },

  async remove(from) {
    await callForeign({
      port: PORT,
      deadlineMs: DEADLINE_MS,
      start: async (): Promise<void> => {
        const { Directory, Filesystem } = await import("@capacitor/filesystem")
        try {
          await Filesystem.deleteFile({
            path: pathOf(from),
            directory: Directory.Cache,
          })
        } catch {
          // Ignored: no copy on the phone is the usual case, a week never
          // watched here.
        }
      },
    }).outcome
  },
}
