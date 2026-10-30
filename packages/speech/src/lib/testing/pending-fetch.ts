import type { FetchImpl } from "@speech/lib/engine/tts-client"

export type PendingFetchCall = {
  readonly signal: AbortSignal
  readonly answer: (bytes: Uint8Array<ArrayBuffer>) => void
}

/**
 * A fetch that has not answered yet. Each call waits until the test answers
 * it, and rejects with its signal's reason once that aborts, as `fetch` does.
 */
export function createPendingFetch(): {
  readonly fetchImpl: FetchImpl
  readonly calls: ReadonlyArray<PendingFetchCall>
} {
  const calls: Array<PendingFetchCall> = []
  const fetchImpl: FetchImpl = (_url, init) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal ?? new AbortController().signal
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      })
      calls.push({
        signal,
        answer: (bytes) => resolve(new Response(bytes, { status: 200 })),
      })
    })
  return { fetchImpl, calls }
}
