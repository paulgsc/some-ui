/**
 * KPLAY's shop (KP4, #2853) as the phone draws it, for `../shop-fit.spec.ts`:
 * the door on "What are you hungry for?", and the shop on a fake home. Words
 * about a phone find two of the shelf's phrases, with their parts; any other
 * words are a miss home kept. A spoken hunch is a take on the simulated
 * microphone, which this home holds and never hears, so the screen stays on
 * hearing it. `shop-unreached` is the shop with home out of reach, the hunch
 * kept on this phone until it is.
 */
import type { JSX } from "react"
import type { ShopPort } from "@some-ui/topik"
// This page is its own build (`build:fit-phone`) and in no shipped bundle,
// so the eager edge the rule guards against costs nothing here.
// eslint-disable-next-line lazy-registry/no-eager-registry-import
import { PortionAsk, ShopScreen } from "@some-ui/topik"
import { ONE_TAKE } from "@some-ui/voice-capture"
import { simulatedPattern, SPEAKING } from "@some-ui/voice-capture/testing"

import { patternPort } from "@/lib/takes-desk"

const noop = (): void => undefined

/** The spoken hunches' takes, as the phone's desk shapes them: one a hunch. */
function hunchTakes(): NonNullable<ShopPort["takes"]> {
  const simulated = simulatedPattern({ options: ONE_TAKE })
  const speaking = { ...SPEAKING, durationMs: 3_000 }
  simulated.mic.script(speaking, speaking, speaking)
  const phone = {
    pattern: simulated.pattern,
    takes: simulated.store,
    full: (): boolean => false,
  }
  return patternPort({ phone: () => phone })
}

/** Home holds a spoken take and is still hearing it while the screen is up. */
const stillHearing: ShopPort["hear"] = (_note, _hunch, gone) =>
  new Promise((_heard, fail) => {
    gone.addEventListener("abort", () => fail(gone.reason), { once: true })
  })

const home: ShopPort = {
  takes: hunchTakes(),
  lookUp: (words) =>
    Promise.resolve(
      /\bphone\b/i.test(words)
        ? {
            kind: "hit",
            phrases: ["ph.where-is-my-phone", "ph.rained-so-stayed-home"],
          }
        : { kind: "kept" }
    ),
  keep: () => true,
  hear: stillHearing,
}

const unreached: ShopPort = {
  lookUp: () => Promise.reject(new Error("home is out of reach")),
  keep: () => true,
  hear: stillHearing,
}

// The room the session viewport gives the applet, which fills it.
const Stage = ({ children }: { children: JSX.Element }): JSX.Element => (
  <div
    style={{
      position: "relative",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 0,
    }}
  >
    {children}
  </div>
)

export const SHOP_FIXTURES = {
  "shop-door": (): JSX.Element => (
    <Stage>
      <PortionAsk
        order={{ portion: "snack", freshness: "either" }}
        onOrder={noop}
        onServe={noop}
        onHunch={noop}
      />
    </Stage>
  ),
  shop: (): JSX.Element => (
    <Stage>
      <ShopScreen port={home} onBack={noop} />
    </Stage>
  ),
  "shop-unreached": (): JSX.Element => (
    <Stage>
      <ShopScreen port={unreached} onBack={noop} />
    </Stage>
  ),
} satisfies Record<string, () => JSX.Element>

export type ShopId = keyof typeof SHOP_FIXTURES
