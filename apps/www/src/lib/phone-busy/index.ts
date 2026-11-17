/**
 * A read of home that found this phone busy with home for every try
 * (`lib/home-link/while-busy`'s `askWhileBusy` ending `busy`, #3155), as a
 * query rejects with it so the page keeps what it last read. Kept outside
 * `lib/home-link`, which is the Android app's alone, so a component on any
 * build can tell it apart without importing the link.
 */
import { isRecord } from "@some-ui/core-utils"

export class PhoneBusyError extends Error {
  override name = "PhoneBusyError"
}

/**
 * Whether `error` is `PhoneBusyError`, or a failure carrying it as its
 * cause (a query's error as `lib/query-outcome` maps it).
 */
export function phoneWasBusy(error: unknown): boolean {
  return (
    error instanceof PhoneBusyError ||
    (isRecord(error) && error.cause instanceof PhoneBusyError)
  )
}

/**
 * Why a query's latest read failed, as a page that keeps its last read
 * says it: `busy` when this phone stayed busy with home, else `away`; null
 * while it didn't fail.
 */
export function readFailure(
  isError: boolean,
  error: unknown
): "away" | "busy" | null {
  if (!isError) return null
  return phoneWasBusy(error) ? "busy" : "away"
}
