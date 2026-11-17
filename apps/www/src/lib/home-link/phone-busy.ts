/**
 * A read of home that found this phone busy with home for every try
 * (`./while-busy`'s `askWhileBusy` ending `busy`, #3155), as a query rejects
 * with it so the page keeps what it last read. Kept apart from
 * `./while-busy` so a component can tell it apart without importing the
 * link.
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
