/**
 * A read of home asked again while the link is busy with another run: it
 * takes one run at a time, and a drag down drains every lane in turn
 * (PULL3), so a read that finds it busy waits a second and asks again, at
 * most `TRIES` times in all. My data, Ideas on home, Takes on home, Studio's
 * feed videos, Studio › Renders and a template's preview read through it.
 * Asks nothing of its own: `ask` is the caller's one request, and `asked`
 * turns one run of the link's `keep` into what a read says.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { ForeignCallError } from "@/lib/intent/foreign"

import type { Run } from "./model"
import type { RawRun } from "./settle"
import { settleRun } from "./settle"

const TRIES = 10
const WAIT_MS = 1_000

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** What a read of home says when it has no answer to read. */
export type NotAnswered =
  | { readonly kind: "unpaired" }
  | { readonly kind: "busy" }
  | { readonly kind: "unreachable" }

/** Home's answer to one run, or why there is none. */
export type Asked =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another run, or the page went: ask again. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

/**
 * Asks home once through `run`, one run of the link's `keep`; never rejects.
 * Asked before the pairing record is read, the run waits for it as the
 * link's own state (PO1, `./model`'s `parked`). Its end is read by
 * `./settle` alone; a fault on this phone is reported, and said as home
 * not reached.
 */
export async function asked(
  run: () => Promise<Run<HomeAnswer>>
): Promise<Asked> {
  return answered(await ranOf(run), (answer) => ({
    kind: "answered",
    answer,
  }))
}

/** `run`'s end, as `./settle` takes it: what it returned, or its throw. */
export async function ranOf<T>(run: () => Promise<Run<T>>): Promise<RawRun<T>> {
  try {
    return { kind: "ran", run: await run() }
  } catch (error) {
    return { kind: "threw", error }
  }
}

/**
 * What an ask says of a run that ended as `raw` (`./settle`): `found` of
 * what it returned; a fault on this phone reported, and said as home not
 * reached (#3155).
 */
export function answered<T, A>(
  raw: RawRun<T>,
  found: (value: T) => A
): A | NotAnswered {
  const settled = settleRun(raw)
  switch (settled.kind) {
    case "answered": {
      return found(settled.value)
    }
    case "failed": {
      // A foreign port's failure (the Keystore's) was reported by its port.
      if (settled.fault instanceof ForeignCallError) {
        return { kind: "unreachable" }
      }
      reportFailure({
        port: "home link: an ask of home",
        error: toIntentError(settled.fault),
      })
      return { kind: "unreachable" }
    }
    case "unpaired":
    case "busy":
    case "unreachable": {
      return settled
    }
    default: {
      return assertNever(settled)
    }
  }
}

/**
 * Home's answer to `ask`, asked again while the link is busy; `unreachable`
 * once it stayed busy `TRIES` times, or once `wanted` says the answer is
 * no longer wanted, before the next ask.
 */
export async function askWhileBusy<A extends { readonly kind: "answered" }>(
  ask: () => Promise<A | NotAnswered>,
  wanted: () => boolean = () => true
): Promise<
  A | { readonly kind: "unpaired" } | { readonly kind: "unreachable" }
> {
  for (let tried = 0; tried < TRIES && wanted(); tried += 1) {
    const asked = await ask()
    switch (asked.kind) {
      case "answered":
      case "unpaired":
      case "unreachable": {
        return asked
      }
      case "busy": {
        await wait(WAIT_MS)
        break
      }
      default: {
        return assertNever(asked)
      }
    }
  }
  return { kind: "unreachable" }
}
