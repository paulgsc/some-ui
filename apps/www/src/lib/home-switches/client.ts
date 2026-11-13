/**
 * The port to home's switches (paulgsc/server `routes::admin_settings`,
 * operator-only): read one switch as it stands, and set it.
 * `packages/contract-harness/contracts/admin-settings.contract.ts` pins the
 * same shapes against a running server.
 *
 * Each switch is one of home's settings, whose value is one yes-or-no field
 * (`FIELD`): Rust Rounds' `{ recording }` and the game feed's
 * `{ following }`. The model only ever sees it as on or off.
 *
 * Every failure is turned into a `Refusal` here (`refusalOf`), so the model
 * and the words never see a status code or an error class.
 */
import { z } from "zod"

import { FileHostUnreachableError } from "@/lib/file-host-config"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  FileHostNotConfiguredError,
  FileHostResponseError,
  requestJSON,
} from "@/lib/file-host-config/client"

import type { Refusal, Standing, SwitchKey } from "./model"

/** The one field of each switch's value on home. */
const FIELD: Readonly<Record<SwitchKey, string>> = {
  "rust-rounds": "recording",
  "game-feed": "following",
}

/** What home answers for a switch, as far as this page reads it. */
const StandingSchema = z.object({
  value: z.record(z.string(), z.unknown()),
  isDefault: z.boolean(),
  setBy: z.enum(["owner", "operator"]).nullable(),
  setAt: z.string().nullable(),
})

function standingOf(field: string, answer: unknown): Standing {
  const read = StandingSchema.parse(answer)
  // Another switch's value (a different field) fails here, not as "off".
  const on = z.boolean().parse(read.value[field])
  if (read.isDefault || read.setBy === null || read.setAt === null) {
    return { on, set: null }
  }
  return { on, set: { by: read.setBy, at: read.setAt } }
}

/** This build has no home to ask. */
class NoHomeError extends Error {
  constructor() {
    super("This build has no file_host to talk to.")
    this.name = "NoHomeError"
  }
}

/** Why a read or a write did not land, in the model's terms. */
export function refusalOf(error: unknown): Refusal {
  if (error instanceof NoHomeError) return "no-home"
  if (error instanceof FileHostNotConfiguredError) return "no-home"
  if (error instanceof FileHostUnreachableError) return "unreachable"
  if (error instanceof FileHostResponseError) {
    if (error.status === 401) return "signed-out"
    if (error.status === 403) return "not-operator"
    if (error.status === 404) return "not-on-home"
  }
  return "failed"
}

export type SwitchesClient = {
  /** The switch as home follows it now. */
  read: () => Promise<Standing>
  /** Sets it, answering with how it now stands. */
  set: (on: boolean) => Promise<Standing>
}

/**
 * `transport` is a seam for tests; the default resolves `file_host` the way
 * every caller in this app does (`lib/file-host-config`).
 */
export function createSwitchesClient(
  key: SwitchKey,
  transport: FileHostTransport | null = createFileHostTransport("account")
): SwitchesClient {
  const route = `/admin/settings/${key}`
  const field = FIELD[key]
  const request = async (init?: RequestInit): Promise<Standing> => {
    if (!transport) throw new NoHomeError()
    // A PUT of a whole value converges if repeated, so a timed-out one may
    // be asked again.
    return standingOf(
      field,
      await requestJSON<unknown>(transport, route, init, { idempotent: true })
    )
  }
  return {
    read: () => request(),
    set: (on) =>
      request({ method: "PUT", body: JSON.stringify({ [field]: on }) }),
  }
}
