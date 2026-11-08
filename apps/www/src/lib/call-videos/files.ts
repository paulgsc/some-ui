/**
 * The phone's copies of each feed's videos (ST38, FEED4): one file an episode
 * in the app's cache (`cachePath`), written a part at a time as home sends
 * it, so a video is never held whole in memory. The cache is the
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

import type { Feed } from "./model"
import type { VideoFiles } from "./runtime"

/** The cache folder every feed's videos are kept in, and shared from. */
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

/**
 * Where an episode's video is kept: the call's as it was before Playoff
 * Delta's came (`<key>.mp4`, so a week already on the phone still matches),
 * each other feed's named for it, so no two feeds' keys meet.
 */
export function cachePath(feed: Feed, key: string): string {
  return feed === "call" ? `${DIR}/${key}.mp4` : `${DIR}/${feed}-${key}.mp4`
}

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

/** The phone's copies of `feed`'s videos. */
export function videoFiles(feed: Feed): VideoFiles {
  const pathOf = (key: string): string => cachePath(feed, key)
  const files: VideoFiles = {
    async size(key) {
      const outcome = await callForeign({
        port: PORT,
        deadlineMs: DEADLINE_MS,
        start: async (): Promise<number | null> => {
          const { Directory, Filesystem } = await import(
            "@capacitor/filesystem"
          )
          try {
            const { size } = await Filesystem.stat({
              path: pathOf(key),
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

    async put(key, base64, first) {
      const outcome = await callForeign({
        port: PORT,
        deadlineMs: DEADLINE_MS,
        start: async (): Promise<boolean> => {
          const { Directory, Filesystem } = await import(
            "@capacitor/filesystem"
          )
          const options = {
            path: pathOf(key),
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

    async where(key) {
      const outcome = await callForeign({
        port: PORT,
        deadlineMs: DEADLINE_MS,
        start: async (): Promise<{ uri: string; src: string }> => {
          const { Directory, Filesystem } = await import(
            "@capacitor/filesystem"
          )
          const { uri } = await Filesystem.getUri({
            path: pathOf(key),
            directory: Directory.Cache,
          })
          return { uri, src: playable(uri) }
        },
      }).outcome
      return valueOr(outcome, null)
    },

    async remove(key) {
      const outcome = await callForeign({
        port: PORT,
        deadlineMs: DEADLINE_MS,
        start: async (): Promise<boolean> => {
          const { Directory, Filesystem } = await import(
            "@capacitor/filesystem"
          )
          const file = { path: pathOf(key), directory: Directory.Cache }
          try {
            await Filesystem.stat(file)
          } catch {
            // Ignored: no copy on the phone is the usual case, an episode never
            // watched here, and there is nothing to remove.
            return true
          }
          // A copy that won't go fails the call, which the port reports.
          await Filesystem.deleteFile(file)
          return true
        },
      }).outcome
      return valueOr(outcome, false)
    },
  }
  return files
}
