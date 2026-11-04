// Copyright (c) 2026 paulgsc — MIT License
//
// Tier-0: no browser globals. The popup's reads, each settled on its own.

/**
 * SLP1 (#2514): whenever the toolbar popup opens it renders every section,
 * each read that fails falls back to its default and is named, and the
 * failure reaches the Diagnostics log. `__tests__/index.test.ts`, "SLP1",
 * holds it over every combination of the four reads failing or answering, by
 * rejection or by a synchronous throw, and over a section that throws while
 * rendering.
 */

/** The popup's reads, by what they read in the person's terms. */
export type PopupRead = "tab" | "settings" | "shortcuts" | "kept-awake"

/** Each read's value, its fallback, and which reads failed. */
export type Settled<T extends Record<PopupRead, unknown>> = {
  readonly values: T
  /** The reads that failed, in `PopupRead` order. */
  readonly failed: ReadonlyArray<PopupRead>
}

/** The reads in the order the popup names them. */
export const POPUP_READS: ReadonlyArray<PopupRead> = [
  "tab",
  "settings",
  "shortcuts",
  "kept-awake",
]

/**
 * Runs every read, each on its own, so one that fails (by rejecting or by
 * throwing before it returns a promise) costs only its own value: it takes
 * its fallback and is named in `failed`.
 */
export async function settleEach<T extends Record<PopupRead, unknown>>(
  reads: { readonly [K in PopupRead]: () => Promise<T[K]> },
  fallbacks: T
): Promise<Settled<T>> {
  const results = await Promise.allSettled(
    POPUP_READS.map((read) => Promise.resolve().then(reads[read]))
  )
  const values = { ...fallbacks }
  const failed: Array<PopupRead> = []
  POPUP_READS.forEach((read, index) => {
    const result = results[index]
    if (result?.status === "fulfilled") {
      Object.assign(values, { [read]: result.value })
    } else {
      failed.push(read)
    }
  })
  return { values, failed }
}
