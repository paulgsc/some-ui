/**
 * Files out through Android's share sheet: written to the app's cache, then
 * handed to `@capacitor/share`, so the person picks where they go (Drive,
 * say). Nothing here sends anything anywhere. Phone-only (`build.paths.ts`).
 */
import type { ForeignPort, ForeignVerdict } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"
import type { FileShare } from "@some-ui/topik"

import { isMissingPlugin } from "@/lib/intent/foreign"

/** Writing the files: a few megabytes at most (`SOUNDBITES_MAX_BYTES`). */
const WRITE_DEADLINE_MS = 60_000
/** The share sheet waits on a person choosing where the files go. */
const SHARE_DEADLINE_MS = 10 * 60_000

function classify(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "The phone didn't finish sharing. Try again.",
    }
  }
  return isMissingPlugin(error)
    ? {
        kind: "unavailable",
        retryable: false,
        summary: "Sharing isn't available in this build of the app.",
      }
    : {
        kind: "unknown",
        retryable: true,
        summary: "Couldn't share the files. Try again.",
      }
}

const PORT: ForeignPort = {
  name: "share sheet (filesystem, share)",
  classify,
  report: reportFailure,
}

/**
 * Base64 without the `data:` prefix, which is what `writeFile` takes for
 * bytes, and the native request for a body of bytes.
 */
export function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void =>
      resolve(String(reader.result).replace(/^[^,]*,/, ""))
    reader.onerror = (): void =>
      reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(blob)
  })
}

export type SharedFile = { name: string; data: string | Blob }

type Files = ReadonlyArray<SharedFile>

/**
 * Something the host hangs beside the share sheet, told when a share's sheet
 * opens; what `opening` returns runs once that sheet settles. `lookIn` names
 * where a kind of file the person picks back usually waits. It cannot change
 * a share, and one that throws is ignored. With none installed, shares are
 * the same and nothing is named.
 */
export type ShareSidecar = {
  opening: (dir: string) => (() => void) | void
  lookIn?: (kind: string) => string | undefined
}

let sidecar: ShareSidecar | undefined

export function installShareSidecar(next: ShareSidecar | undefined): void {
  sidecar = next
}

/** What the sidecar names for `kind`. */
export function lookIn(kind: string): string | undefined {
  try {
    return sidecar?.lookIn?.(kind)
  } catch {
    return undefined
  }
}

/** Tells the sidecar `dir`'s sheet is opening; returns its settle, never throwing. */
function sidecarOpening(dir: string): () => void {
  try {
    const settle = sidecar?.opening(dir)
    return () => {
      try {
        settle?.()
      } catch {
        return
      }
    }
  } catch {
    return () => undefined
  }
}

/** The share last started in each `dir`, settled or not. */
const sharing = new Map<string, Promise<unknown>>()

/**
 * Writes `files` (text as UTF-8, a blob as its bytes) to the cache under
 * `dir`, replacing what an earlier share left there, so the cache holds at
 * most one share per `dir`; then opens the share sheet with them. Backing
 * out of the sheet is `cancelled`, not a failure. Shares to one `dir` run one
 * at a time, so a second never deletes files a sheet still holds open.
 */
export function shareFiles(
  dir: string,
  title: string,
  files: Files
): ReturnType<FileShare> {
  const run = (): ReturnType<FileShare> => writeAndShare(dir, title, files)
  const share = (sharing.get(dir) ?? Promise.resolve()).then(run, run)
  sharing.set(dir, share)
  return share
}

async function writeAndShare(
  dir: string,
  title: string,
  files: Files
): ReturnType<FileShare> {
  const written = await callForeign({
    port: PORT,
    deadlineMs: WRITE_DEADLINE_MS,
    start: async (): Promise<Array<string>> => {
      const { Directory, Encoding, Filesystem } = await import(
        "@capacitor/filesystem"
      )
      // Ignored: no folder from an earlier share is the usual case; writing
      // the files below fails in its own words if the folder is unusable.
      await Filesystem.rmdir({
        path: dir,
        directory: Directory.Cache,
        recursive: true,
      }).catch(() => undefined)
      const uris: Array<string> = []
      for (const { name, data } of files) {
        const text = typeof data === "string"
        const { uri } = await Filesystem.writeFile({
          path: `${dir}/${name}`,
          directory: Directory.Cache,
          data: text ? data : await base64(data),
          recursive: true,
          ...(text ? { encoding: Encoding.UTF8 } : {}),
        })
        uris.push(uri)
      }
      return uris
    },
  }).outcome
  if (written.status !== "succeeded") return written

  const settle = sidecarOpening(dir)
  const shared = callForeign({
    port: PORT,
    deadlineMs: SHARE_DEADLINE_MS,
    start: async (): Promise<"shared" | "cancelled"> => {
      const { Share } = await import("@capacitor/share")
      try {
        await Share.share({ title, files: written.value })
        return "shared"
      } catch (error) {
        if (error instanceof Error && error.message === "Share canceled") {
          return "cancelled"
        }
        throw error
      }
    },
  }).outcome
  void shared.finally(settle)
  return shared
}

/**
 * Whether this page runs inside the native app, read from the
 * `window.Capacitor` the native bridge injects before the page loads,
 * rather than from `@capacitor/core`, which would put the runtime in every
 * build's main bundle to answer one question.
 */
export function runsNatively(host: object = globalThis): boolean {
  const capacitor: unknown = Reflect.get(host, "Capacitor")
  if (typeof capacitor !== "object" || capacitor === null) return false
  const isNative: unknown = Reflect.get(capacitor, "isNativePlatform")
  return (
    typeof isNative === "function" &&
    Reflect.apply(isNative, capacitor, []) === true
  )
}
