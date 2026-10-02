/**
 * The ports as the phone provides them: IndexedDB, the microphone, an
 * `Audio` element, the clock, the page's visibility and Android's share
 * sheet. The one place the runtime meets the browser's own machines, each
 * wrapped so that what comes back is a result, never a state we then claim
 * to know.
 */
import { Capacitor } from "@capacitor/core"

import { startMicRecording } from "./recorder"
import type { Playback, Player, SoundbitesPorts } from "./runtime"
import type { ShareOutcome, SoundbiteShare } from "./share"
import type { SoundbiteStore } from "./store"
import { indexedDbSoundbiteStore } from "./store"

/**
 * Plays through an `Audio` element. `ended` settles once, whichever comes
 * first: the audio ending, `play()` failing, or `stop()`. The object URL is
 * released then too.
 */
const audioPlayer: Player = {
  play(audio): Playback {
    const url = URL.createObjectURL(audio)
    const element = new Audio(url)
    let settle: () => void = () => undefined
    const ended = new Promise<void>((resolve) => {
      settle = resolve
    })
    let done = false
    const stop = (): void => {
      if (done) return
      done = true
      element.pause()
      URL.revokeObjectURL(url)
      settle()
    }
    element.onended = stop
    element.play().catch(stop)
    return { ended, stop }
  },
}

function onPageVisibility(listener: (hidden: boolean) => void): () => void {
  const onChange = (): void => listener(document.visibilityState === "hidden")
  document.addEventListener("visibilitychange", onChange)
  // Now, not only on the next change: a page can mount already hidden.
  onChange()
  return () => document.removeEventListener("visibilitychange", onChange)
}

/** Where shared files are written: the app's cache, under its own folder. */
const SHARE_DIR = "soundbites-shared"

/** A blob as bare base64, which is how `Filesystem.writeFile` takes bytes. */
function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(",") + 1))
    }
    reader.onerror = (): void =>
      reject(reader.error ?? new Error("soundbite unreadable"))
    reader.readAsDataURL(blob)
  })
}

/**
 * The share sheet on the Android app. An Android WebView has no
 * `navigator.share`, and the share sheet takes files only as `file://` paths
 * it can serve through the app's `FileProvider` (its `cache-path`), so each
 * file is written to the cache first.
 *
 * Lifetime: the folder is emptied at the start of the next share, not after
 * this one. The share sheet answers once a target is picked, and the target
 * may read the files later than that; the cache is Android's to clear too.
 * So at most one share's files (`SOUNDBITE_LIMIT` recordings and a note)
 * are on disk at a time.
 */
async function shareNatively(share: SoundbiteShare): Promise<ShareOutcome> {
  const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ])
  // Absent on the first share; there is nothing else to fail on.
  await Filesystem.rmdir({
    path: SHARE_DIR,
    directory: Directory.Cache,
    recursive: true,
  }).catch(() => undefined)
  const uris: Array<string> = []
  for (const file of share.files) {
    const text = file.mimeType.startsWith("text/")
    const { uri } = await Filesystem.writeFile({
      path: `${SHARE_DIR}/${file.name}`,
      directory: Directory.Cache,
      recursive: true,
      ...(text
        ? { data: await file.data.text(), encoding: Encoding.UTF8 }
        : { data: await base64Of(file.data) }),
    })
    uris.push(uri)
  }
  try {
    await Share.share({
      title: share.title,
      files: uris,
      dialogTitle: "Send soundbites to",
    })
    return "shared"
  } catch (error: unknown) {
    // The plugin's word for the person backing out of the sheet.
    if (error instanceof Error && /cancel/i.test(error.message))
      return "cancelled"
    throw error
  }
}

/** One store per page load, so the database opens once. */
let store: SoundbiteStore | null = null

export function phonePorts(): SoundbitesPorts {
  store ??= indexedDbSoundbiteStore()
  return {
    store,
    startRecording: startMicRecording,
    player: audioPlayer,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    onVisibility: onPageVisibility,
    share: Capacitor.isNativePlatform() ? shareNatively : null,
  }
}
