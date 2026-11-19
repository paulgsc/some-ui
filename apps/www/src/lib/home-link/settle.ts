/**
 * The one sanitizer between the link's I/O and its states (#3152, #3155):
 * each raw outcome of reading the pairing record, and of a run of the
 * link, made into a member of a closed union, by a pure step. Nothing past
 * it reads a thrown error, a null or the link's own `kind` to say what
 * happened.
 *
 * - **The pairing record's read** (`settleRead`): a record, none, one
 *   lost, one that won't parse, the read failing, or its deadline passing
 *   (`./credential`'s 5 s, which fails the read). Each is what the
 *   link's `read` event finds. A second read's answer, and one landing after
 *   a pairing or an Unpair has moved the link on, are dropped by `./model`'s
 *   `step`, which takes `read` only while `reading`.
 * - **A run's end** (`settleRun`): it ran (`done`), was stopped, was turned
 *   away and why (`./model`'s `Refusal`), or threw. A throw is home not
 *   answering (`unanswered`), the phone blocked from reaching it
 *   (`blockedOf`, NA1), or a fault on this phone, which its caller reports.
 */
import { assertNever, isRecord } from "@some-ui/core-utils"

import type { HomeBlockedReason } from "@/lib/device-backend/native-http/no-answer"
import {
  HomeBlockedError,
  HomeNoAnswerError,
} from "@/lib/device-backend/native-http/no-answer"
import { isFileHostTimeout } from "@/lib/file-host-config/client"

import type { HomeLinkEvent, Run } from "./model"

/**
 * The pairing record on the phone. `phoneId` is home's id for this phone
 * (SIGNIN7, C496), which its owner's phone list shows it by; `name` is what
 * the owner typed while pairing. Both are null for a pairing made before
 * home gave them.
 */
export type PairingRecord = {
  base: string
  token: string
  id: string
  since: number | null
  phoneId: string | null
  /** The account home named at pairing (C751), or null from a home before it. */
  account: string | null
  name: string | null
}

/** `value` if it is a non-empty string, else null. */
const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null

export function parsePairing(record: string): PairingRecord | null {
  try {
    const parsed: unknown = JSON.parse(record)
    return isRecord(parsed) &&
      typeof parsed.base === "string" &&
      typeof parsed.token === "string"
      ? {
          base: parsed.base,
          token: parsed.token,
          id: typeof parsed.id === "string" ? parsed.id : parsed.base,
          since:
            typeof parsed.pairedAt === "number" &&
            Number.isFinite(parsed.pairedAt)
              ? parsed.pairedAt
              : null,
          phoneId: textOrNull(parsed.phoneId),
          account: textOrNull(parsed.account),
          name: textOrNull(parsed.name),
        }
      : null
  } catch {
    return null
  }
}

/** What the phone's record read came to, before it is read as a pairing. */
export type RawRead =
  | {
      readonly kind: "read"
      readonly record: string | null
      readonly lost: boolean
    }
  /** The read failed, or passed its deadline (`./credential`). */
  | { readonly kind: "failed" }

/** What the link's `read` event finds. */
export type ReadFound = Extract<HomeLinkEvent, { type: "read" }>["found"]

/**
 * The pairing `raw` holds, as the link's `read` finds it: a pairing; none;
 * `lost`, the record gone (a restore, say); `unreadable`, the phone unable
 * to read it just now. A record that won't parse is no pairing, as a
 * missing one is.
 */
export function settleRead(raw: RawRead): ReadFound {
  if (raw.kind === "failed") return "unreadable"
  const pairing = raw.record === null ? null : parsePairing(raw.record)
  if (pairing !== null) {
    const { base, id, since, name } = pairing
    return { base, id, since, name }
  }
  return raw.lost ? "lost" : null
}

/** How a run of the link ended, before it is said. */
export type RawRun<T> =
  | { readonly kind: "ran"; readonly run: Run<T> }
  | { readonly kind: "threw"; readonly error: unknown }

/** A run of the link, as an ask of home says it. */
export type Settled<T> =
  | { readonly kind: "answered"; readonly value: T }
  /** Not paired, or the pairing's record has gone: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was doing something else, or the page went: ask again. */
  | { readonly kind: "busy" }
  /** Home didn't answer, or this phone couldn't reach it (NA1). */
  | { readonly kind: "unreachable" }
  /** A fault on this phone, for the caller to report. */
  | { readonly kind: "failed"; readonly fault: unknown }

/** What `raw` says to the ask that ran it. */
export function settleRun<T>(raw: RawRun<T>): Settled<T> {
  if (raw.kind === "threw") {
    const { error } = raw
    return unanswered(error) || blockedOf(error) !== null
      ? { kind: "unreachable" }
      : { kind: "failed", fault: error }
  }
  const { run } = raw
  switch (run.kind) {
    case "done": {
      return { kind: "answered", value: run.value }
    }
    case "stopped": {
      return { kind: "busy" }
    }
    case "refused": {
      switch (run.why) {
        case "unpaired":
        case "gone": {
          return { kind: "unpaired" }
        }
        case "busy":
        case "pairing":
        case "preempted": {
          return { kind: "busy" }
        }
        default: {
          return assertNever(run.why)
        }
      }
    }
    default: {
      return assertNever(run)
    }
  }
}

/**
 * `error` is a request finding no answer from home, or a wrapping of that:
 * `native-http`'s connection failing or timing out (`HomeNoAnswerError`),
 * or `requestJSON`'s own deadline passing first (`isFileHostTimeout`). Any
 * other failure, a Keystore read or a plugin missing from the build among
 * them, is a fault on this phone.
 */
export function unanswered(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause instanceof HomeNoAnswerError || isFileHostTimeout(cause)) {
      return true
    }
  }
  return false
}

/** Why `error`, or a cause of it, failed before home could answer (NA1). */
export function blockedOf(error: unknown): HomeBlockedReason | null {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause instanceof HomeBlockedError) return cause.reason
  }
  return null
}
