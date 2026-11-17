/**
 * The phone list's ports to home (SIGNIN7; paulgsc/server
 * `handlers::{phones, rename_phone, sign_out_phone}`, calls C493–C498):
 * `GET /auth/phones`, `PATCH /auth/phones/:id` and `DELETE /auth/phones/:id`,
 * each from this browser's passkey session. The answer's shape is
 * `packages/contract-harness`'s `auth.phones` contract.
 */
import { z } from "zod"

import { DATA_MODE } from "@/lib/data-mode"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  FileHostResponseError,
  requestJSON,
} from "@/lib/file-host-config/client"

import type { Phone, Refusal } from "./model"
import type { PhonesPorts } from "./runtime"

const PhonesView = z.object({
  phones: z.array(
    z.object({
      phoneId: z.string().min(1),
      pairedOn: z.string().nullable(),
      label: z.string().nullable(),
      renewedAt: z.number(),
    })
  ),
})

/** Home's list as the screen keeps it. */
export function phonesFrom(answer: unknown): ReadonlyArray<Phone> {
  return PhonesView.parse(answer).phones.map((phone) => ({
    id: phone.phoneId,
    pairedOn: phone.pairedOn,
    name: phone.label,
    renewedAt: phone.renewedAt,
  }))
}

/** Why home didn't rename or sign out a phone. */
export function refusalOf(error: unknown): Refusal {
  if (error instanceof FileHostResponseError) {
    if (error.status === 404) return "gone"
    if (error.status === 422) return "refused"
    if (error.status === 401) return "signedOut"
  }
  return "failed"
}

/** This build's way to home, or null where there is none (Pages). */
export function phonesTransport(): FileHostTransport | null {
  return DATA_MODE === "static" ? null : createFileHostTransport("account")
}

const path = (id: string): string => `/auth/phones/${encodeURIComponent(id)}`

/** The ports over `transport`. */
export function homePhones(transport: FileHostTransport): PhonesPorts {
  return {
    list: async () =>
      phonesFrom(await requestJSON<unknown>(transport, "/auth/phones")),
    rename: async (id, name): Promise<void> => {
      await requestJSON(transport, path(id), {
        method: "PATCH",
        body: JSON.stringify({ label: name }),
      })
    },
    signOut: async (id): Promise<void> => {
      await requestJSON(transport, path(id), { method: "DELETE" })
    },
    refusalOf,
  }
}
