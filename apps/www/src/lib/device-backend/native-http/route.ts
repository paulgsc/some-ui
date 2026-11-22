/**
 * Home asked over the phone's other local networks, Wi-Fi and Ethernet
 * (#3411, NA2): the app's own HomeRoute plugin (apps/mobile
 * HomeRoutePlugin.java), asked only once a request over the network
 * Android gave this app could not be sent at all: its connection never
 * opened, or home's name wasn't found (`./index`'s `neverSent`). Android can put this app's traffic on mobile data
 * while the phone sits on home's Wi-Fi (the S21 Ultra's log: home's address
 * tried "from /100.x", a carrier's address); a request opened on the Wi-Fi
 * network itself still reaches home.
 *
 * Its three ends, as `./index` reads them:
 * - `answered`: home's answer, over the network named (`over`);
 * - `held`: Android says it keeps this app off the network, which no other
 *   network gets past;
 * - `none`: no other network reached home, or there is no other, or this
 *   build can't ask (a test's mocked Capacitor, a missing plugin): the
 *   first failure stands.
 */
import { registerPlugin } from "@capacitor/core"
import type { ForeignPort, ForeignVerdict } from "@some-ui/intent-kit"
import { callForeign } from "@some-ui/intent-kit"

import { foreignValue } from "@/lib/intent/foreign"

/** One request as HomeRoute takes it: Capacitor HTTP's options, the body already text. */
export type RouteRequest = {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  /** The body as text, or as base64 with `dataType: "file"`. */
  readonly data?: string
  readonly dataType?: "file"
  readonly responseType: "text" | "blob"
  readonly timeout: number
  /**
   * How long from the call the plugin may still start a network's try
   * (HomeRoutePlugin): less than `DEADLINE_MS`, so nothing is sent after
   * this page stopped waiting for it.
   */
  readonly budget: number
}

type RouteAnswer = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly data: string
  readonly over: string
}

type HomeRoutePlugin = {
  readonly request: (options: RouteRequest) => Promise<RouteAnswer>
}

export type Routed =
  | { readonly kind: "answered"; readonly answer: RouteAnswer }
  | { readonly kind: "held" }
  | { readonly kind: "none" }

/** The plugin's code, from Capacitor's rejection. */
const codeOf = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null

/** Each network the plugin tries waits its own connect and read. */
const DEADLINE_MS = 45_000
/** The plugin's budget: room before the deadline for its answer to arrive. */
export const ROUTE_BUDGET_MS = DEADLINE_MS - 5_000

const PORT: ForeignPort = {
  name: "home server (other networks)",
  classify: (error): ForeignVerdict =>
    codeOf(error) === "HELD"
      ? {
          kind: "rejected",
          retryable: true,
          summary: "This phone keeps the app off the network.",
        }
      : {
          kind: "unreachable",
          retryable: true,
          summary: "No other network reached home.",
        },
  // The first failure is the one the link tells (AW1, NA1); this is its
  // second try, which says itself in the native log (HomeRoutePlugin).
  report: (): void => undefined,
}

let plugin: HomeRoutePlugin | null = null

/** Home asked over the phone's other networks; never rejects. */
export async function routeElsewhere(request: RouteRequest): Promise<Routed> {
  /** Why it failed, as `PORT` classified it; null for a throw before it ran. */
  const seen: { verdict: string | null } = { verdict: null }
  try {
    plugin ??= registerPlugin<HomeRoutePlugin>("HomeRoute")
    const route = plugin
    const answer = await foreignValue(
      callForeign({
        port: PORT,
        deadlineMs: DEADLINE_MS,
        start: () => route.request(request),
      }),
      (error) => {
        seen.verdict = error.kind
        return error
      }
    )
    return { kind: "answered", answer }
  } catch {
    // Only `PORT` says rejected, and only for HELD.
    return seen.verdict === "rejected" ? { kind: "held" } : { kind: "none" }
  }
}
