/**
 * The port to home's levers (paulgsc/server `routes::admin_settings`,
 * operator-only): read Rust Rounds recording as it stands, and set it.
 * `packages/contract-harness/contracts/admin-settings.contract.ts` pins the
 * same shapes against a running server.
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

import type { Refusal, Standing } from "./model"

const ROUTE = "/admin/settings/rust-rounds"

/** What home answers for a lever, as far as this page reads it. */
const StandingSchema = z.object({
  value: z.object({ recording: z.boolean() }),
  isDefault: z.boolean(),
  setBy: z.enum(["owner", "operator"]).nullable(),
  setAt: z.string().nullable(),
})

function standingOf(answer: unknown): Standing {
  const read = StandingSchema.parse(answer)
  if (read.isDefault || read.setBy === null || read.setAt === null) {
    return { recording: read.value.recording, set: null }
  }
  return {
    recording: read.value.recording,
    set: { by: read.setBy, at: read.setAt },
  }
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
  /** Rust Rounds recording as home follows it now. */
  read: () => Promise<Standing>
  /** Sets it, answering with how it now stands. */
  set: (recording: boolean) => Promise<Standing>
}

/**
 * `transport` is a seam for tests; the default resolves `file_host` the way
 * every caller in this app does (`lib/file-host-config`).
 */
export function createSwitchesClient(
  transport: FileHostTransport | null = createFileHostTransport("account")
): SwitchesClient {
  const request = async (init?: RequestInit): Promise<Standing> => {
    if (!transport) throw new NoHomeError()
    // A PUT of a whole value converges if repeated, so a timed-out one may
    // be asked again.
    return standingOf(
      await requestJSON<unknown>(transport, ROUTE, init, { idempotent: true })
    )
  }
  return {
    read: () => request(),
    set: (recording) =>
      request({ method: "PUT", body: JSON.stringify({ recording }) }),
  }
}
