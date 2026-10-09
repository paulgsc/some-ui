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

/** Base64 without the `data:` prefix, which is what `writeFile` takes for bytes. */
function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void =>
      resolve(String(reader.result).replace(/^[^,]*,/, ""))
    reader.onerror = (): void =>
      reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(blob)
  })
}

/**
 * Writes `files` (text as UTF-8, a blob as its bytes) to the cache under
 * `dir`, replacing what an earlier share left there, so the cache holds at
 * most one share per `dir`; then opens the share sheet with them. Backing
 * out of the sheet is `cancelled`, not a failure.
 */
export async function shareFiles(
  dir: string,
  title: string,
  files: ReadonlyArray<{ name: string; data: string | Blob }>
): ReturnType<FileShare> {
  const written = await callForeign({
    port: PORT,
    deadlineMs: WRITE_DEADLINE_MS,
    start: async (): Promise<Array<string>> => {
      const { Directory, Encoding, Filesystem } = await import(
        "@capacitor/filesystem"
      )
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

  return callForeign({
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
}

/** The drama's next-scene prompt, as topik's `FileShare` port. */
export const shareDramaPrompt: FileShare = ({ name, text }) =>
  shareFiles("drama-prompt", "The next scene's prompt", [{ name, data: text }])
