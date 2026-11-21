/**
 * The port to home's settings (paulgsc/server `routes::admin_settings`,
 * operator-only): read one as it stands, and set it.
 * `packages/contract-harness/contracts/admin-settings.contract.ts` pins the
 * same shapes against a running server.
 *
 * Each setting's value on home has its own shape, read and written by one
 * codec per key (`CODECS`, C916): a switch's is one yes-or-no field (Rust
 * Rounds' `{ recording }`, the game feed's `{ following }`), and the teams
 * followed live are `{ teams }`, ESPN's abbreviations, which home keeps
 * sorted and each once. The model sees only the value (`SettingValue`).
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

import type {
  Refusal,
  SetAt,
  SettingKey,
  SettingValue,
  Standing,
} from "./model"

/** How one setting's value is read from home's answer and written back. */
type Codec<V> = {
  /** The value from home's `value`; throws when it isn't this setting's. */
  readonly read: (value: Readonly<Record<string, unknown>>) => V
  /** The body a PUT carries. */
  readonly write: (value: V) => Readonly<Record<string, unknown>>
}

/** A switch's value: one yes-or-no `field`. */
const switchCodec = (field: string): Codec<boolean> => ({
  read: (value) => z.boolean().parse(value[field]),
  write: (on) => ({ [field]: on }),
})

/** Each team as ESPN abbreviates it: 2 to 4 capitals, as home holds them. */
const TeamsSchema = z.array(z.string().regex(/^[A-Z]{2,4}$/))

/** Each setting's codec, one per key (C916). */
const CODECS: { readonly [K in SettingKey]: Codec<SettingValue[K]> } = {
  "rust-rounds": switchCodec("recording"),
  "game-feed": switchCodec("following"),
  "game-teams": {
    read: (value) => TeamsSchema.parse(value["teams"]),
    write: (teams) => ({ teams }),
  },
}

/** What home answers for a switch, as far as this page reads it. */
const StandingSchema = z.object({
  value: z.record(z.string(), z.unknown()),
  isDefault: z.boolean(),
  setBy: z.enum(["owner", "operator"]).nullable(),
  setAt: z.string().nullable(),
})

function standingOf<V>(
  codec: Codec<V>,
  answer: unknown
): { readonly value: V; readonly set: SetAt } {
  const read = StandingSchema.parse(answer)
  // Another setting's value (a different field) fails here, not as "off".
  const value = codec.read(read.value)
  if (read.isDefault || read.setBy === null || read.setAt === null) {
    return { value, set: null }
  }
  return { value, set: { by: read.setBy, at: read.setAt } }
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
    if (error.status === 422) return "refused"
  }
  return "failed"
}

export type SwitchesClient<K extends SettingKey> = {
  /** The setting as home follows it now. */
  read: () => Promise<Standing<K>>
  /** Sets it, answering with how it now stands. */
  set: (value: SettingValue[K]) => Promise<Standing<K>>
}

/**
 * `transport` is a seam for tests; the default resolves `file_host` the way
 * every caller in this app does (`lib/file-host-config`).
 */
export function createSwitchesClient<K extends SettingKey>(
  key: K,
  transport: FileHostTransport | null = createFileHostTransport("account")
): SwitchesClient<K> {
  const route = `/admin/settings/${key}`
  const codec: Codec<SettingValue[K]> = CODECS[key]
  const request = async (init?: RequestInit): Promise<Standing<K>> => {
    if (!transport) throw new NoHomeError()
    // A PUT of a whole value converges if repeated, so a timed-out one may
    // be asked again.
    return standingOf(
      codec,
      await requestJSON<unknown>(transport, route, init, { idempotent: true })
    )
  }
  return {
    read: () => request(),
    set: (value) =>
      request({ method: "PUT", body: JSON.stringify(codec.write(value)) }),
  }
}
