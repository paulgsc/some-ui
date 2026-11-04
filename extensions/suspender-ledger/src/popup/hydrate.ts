// Copyright (c) 2026 paulgsc — MIT License
//
// No browser globals: the popup's reads, each settled on its own.

import { POPUP_READS, type PopupRead } from "@suspender/types/messages"

/** What answered, by read, and which reads failed, in `POPUP_READS` order. */
export type Settled<T extends Record<PopupRead, unknown>> = {
  readonly answered: Partial<T>
  readonly failed: ReadonlyArray<PopupRead>
}

/**
 * Runs `reads`, each on its own, so one that fails, by rejecting or by
 * throwing before it returns a promise, costs only its own answer.
 */
export async function settleEach<T extends Record<PopupRead, unknown>>(reads: {
  readonly [K in keyof T]?: () => Promise<T[K]>
}): Promise<Settled<T>> {
  const asked = POPUP_READS.filter((read) => reads[read] !== undefined)
  const results = await Promise.allSettled(
    asked.map((read) => Promise.resolve().then(() => reads[read]?.()))
  )
  const answered: Partial<T> = {}
  const failed: Array<PopupRead> = []
  asked.forEach((read, index) => {
    const result = results[index]
    if (result?.status === "fulfilled") {
      Object.assign(answered, { [read]: result.value })
    } else {
      failed.push(read)
    }
  })
  return { answered, failed }
}
