/**
 * A screen's ask of home through the link (LA8), as the screens that read
 * home on open (Ideas on home, Studio's Previews) read it: one ask, asked
 * again while the link is busy (`askWhileBusy`), and said in the screen's
 * own terms. `readHome` is the read policy they share: no answer passes on
 * why, a `404` is a home that serves no such route yet (`older`), any other
 * status but `200`, or a body `schema` doesn't read, is `unreadable`.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { HomeRead } from "@some-ui/soundbites"
import type { z } from "zod"

import type { Asked } from "./while-busy"
import { askWhileBusy } from "./while-busy"

/** Home's answer, once the link was free, or why there is none. */
export type HomeAnswered =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  | { readonly kind: "unpaired" }
  | { readonly kind: "away" }
  | { readonly kind: "busy" }

/** `ask`, asked again while the link is busy; no answer is `away`. */
export async function askHome(
  ask: () => Promise<Asked>
): Promise<HomeAnswered> {
  const asked = await askWhileBusy(ask)
  return asked.kind === "unreachable" ? { kind: "away" } : asked
}

/** `ask`'s answer as `schema` reads it, or why there is none. */
export async function readHome<T>(
  ask: () => Promise<Asked>,
  schema: z.ZodType<T>
): Promise<HomeRead<T>> {
  const asked = await askHome(ask)
  if (asked.kind !== "answered") return asked
  const { status, body } = asked.answer
  if (status === 404) return { kind: "older" }
  if (status !== 200) return { kind: "unreadable" }
  const value = readAs(schema, body)
  return value === null ? { kind: "unreadable" } : { kind: "read", value }
}
