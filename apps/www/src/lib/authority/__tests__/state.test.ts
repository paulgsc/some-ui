import { describe, expect, it } from "vitest"

import type {
  AuthorityEvent,
  AuthorityState,
  Backend,
} from "@/lib/authority/state"
import {
  accountUnavailable,
  authorityOf,
  defaultChoice,
  initialState,
  reportingAllowed,
  step,
} from "@/lib/authority/state"

function run(
  state: AuthorityState,
  ...events: Array<AuthorityEvent>
): AuthorityState {
  return events.reduce((current, event) => step(current, event).state, state)
}

const remote = (): AuthorityState => initialState("remote", null)

describe("where a build starts", () => {
  it("learns on the device wherever a server is optional", () => {
    expect(authorityOf(remote())).toEqual({ kind: "local", epoch: 0 })
    expect(defaultChoice("remote")).toBe("local")
  })

  it("is the account in the device build, whose backend is the store", () => {
    const device = initialState("in-process", null)
    expect(device.choice).toBe("account")
    expect(authorityOf(device).kind).toBe("pending")
  })

  it("can only be local with no server, whatever was remembered", () => {
    const demo = initialState("none", "account")
    expect(demo.choice).toBe("local")
    expect(step(demo, { type: "chose", choice: "account" }).state.choice).toBe(
      "local"
    )
    expect(
      step(demo, { type: "chose", choice: "account" }).authorityChanged
    ).toBe(false)
  })

  it("remembers a choice a returning visitor made", () => {
    expect(initialState("remote", "account").choice).toBe("account")
  })
})

describe("the authority a choice and a session amount to", () => {
  const table: Array<
    [
      string,
      "local" | "account",
      "unknown" | "signed-in" | "signed-out",
      string,
    ]
  > = [
    ["chose the device, no session", "local", "unknown", "local"],
    ["chose the device, signed in", "local", "signed-in", "local"],
    ["chose the device, signed out", "local", "signed-out", "local"],
    ["chose the account, still asking", "account", "unknown", "pending"],
    ["chose the account, signed in", "account", "signed-in", "account"],
    ["chose the account, session gone", "account", "signed-out", "local"],
  ]
  it.each(table)("%s -> %s", (_name, choice, session, kind) => {
    const state: AuthorityState = {
      backend: "remote",
      choice,
      session,
      reporting: false,
      epoch: 0,
    }
    expect(authorityOf(state).kind).toBe(kind)
  })

  it("says the account is unavailable only when it was chosen and the session is gone", () => {
    const base: AuthorityState = {
      backend: "remote",
      choice: "account",
      session: "signed-out",
      reporting: false,
      epoch: 0,
    }
    expect(accountUnavailable(base)).toBe(true)
    expect(accountUnavailable({ ...base, choice: "local" })).toBe(false)
    expect(accountUnavailable({ ...base, session: "signed-in" })).toBe(false)
    expect(accountUnavailable({ ...base, session: "unknown" })).toBe(false)
  })
})

describe("signing in transfers nothing and switches only when it says so", () => {
  it("a session that is not adopted leaves learning on the device", () => {
    const next = step(remote(), { type: "session-started", adopt: false }).state
    expect(next.session).toBe("signed-in")
    expect(authorityOf(next).kind).toBe("local")
  })

  it("an adopted session makes the account the authority", () => {
    expect(
      authorityOf(run(remote(), { type: "session-started", adopt: true })).kind
    ).toBe("account")
  })
})

describe("the epoch", () => {
  it("advances when the kind of authority changes", () => {
    const result = step(remote(), { type: "chose", choice: "account" })
    expect(authorityOf(result.state)).toEqual({ kind: "pending", epoch: 1 })
    expect(result.authorityChanged).toBe(true)
  })

  it("advances when a ceremony starts a session, even into the same kind", () => {
    const signedIn = run(remote(), { type: "session-started", adopt: true })
    const again = step(signedIn, { type: "session-started", adopt: true })
    expect(authorityOf(signedIn).kind).toBe("account")
    expect(authorityOf(again.state).kind).toBe("account")
    expect(again.state.epoch).toBeGreaterThan(signedIn.epoch)
    expect(again.authorityChanged).toBe(true)
  })

  it("advances when a signed-in session ends", () => {
    const signedIn = run(remote(), { type: "session-started", adopt: true })
    const ended = step(signedIn, { type: "session-ended", forget: false })
    expect(ended.state.epoch).toBeGreaterThan(signedIn.epoch)
    expect(authorityOf(ended.state).kind).toBe("local")
  })

  it("does not advance when a probe only confirms what was believed", () => {
    const signedIn = run(remote(), { type: "session-started", adopt: true })
    const confirmed = step(signedIn, {
      type: "session-learned",
      session: "signed-in",
    })
    expect(confirmed.state).toBe(signedIn)
    expect(confirmed.authorityChanged).toBe(false)
  })

  it("does not advance when a returning account user's probe settles: nothing was read while pending", () => {
    const returning = initialState("remote", "account")
    expect(authorityOf(returning).kind).toBe("pending")

    const answered = step(returning, {
      type: "session-learned",
      session: "signed-in",
    })
    expect(authorityOf(answered.state)).toEqual({ kind: "account", epoch: 0 })
    expect(answered.authorityChanged).toBe(false)

    const refused = step(returning, {
      type: "session-learned",
      session: "signed-out",
    })
    expect(authorityOf(refused.state)).toEqual({ kind: "local", epoch: 0 })
    expect(refused.authorityChanged).toBe(false)
  })

  it("advances when the person asks for the account", () => {
    const asked = step(remote(), { type: "chose", choice: "account" })
    expect(authorityOf(asked.state).kind).toBe("pending")
    expect(asked.authorityChanged).toBe(true)
  })

  it("never goes backwards", () => {
    const events: Array<AuthorityEvent> = [
      { type: "chose", choice: "account" },
      { type: "session-started", adopt: true },
      { type: "session-ended", forget: false },
      { type: "session-learned", session: "signed-out" },
      { type: "chose", choice: "local" },
      { type: "session-started", adopt: false },
    ]
    let state = remote()
    for (const event of events) {
      const next = step(state, event).state
      expect(next.epoch).toBeGreaterThanOrEqual(state.epoch)
      state = next
    }
  })
})

describe("an expiry ends account capability, not local learning, and rewrites nothing", () => {
  it("falls back to the device and returns to the account when a session is back", () => {
    const onAccount = run(remote(), { type: "session-started", adopt: true })
    const expired = step(onAccount, {
      type: "session-ended",
      forget: false,
    }).state
    expect(expired.choice).toBe("account")
    expect(authorityOf(expired).kind).toBe("local")
    expect(accountUnavailable(expired)).toBe(true)

    const back = run(expired, { type: "session-started", adopt: false })
    expect(authorityOf(back).kind).toBe("account")
  })

  it("never turns a lost session into the person's choice", () => {
    const backends: Array<Backend> = ["remote"]
    for (const backend of backends) {
      const state = run(initialState(backend, "account"), {
        type: "session-learned",
        session: "signed-out",
      })
      expect(state.choice).toBe("account")
    }
  })
})

describe("leaving on purpose", () => {
  it("forgets the account choice, where an expiry would keep it", () => {
    const onAccount = run(remote(), { type: "session-started", adopt: true })

    const left = step(onAccount, { type: "session-ended", forget: true }).state
    expect(left.choice).toBe("local")
    expect(accountUnavailable(left)).toBe(false)
    expect(authorityOf(left).kind).toBe("local")

    const expired = step(onAccount, {
      type: "session-ended",
      forget: false,
    }).state
    expect(expired.choice).toBe("account")
    expect(accountUnavailable(expired)).toBe(true)
  })
})

describe("reporting", () => {
  const signedIn = (): AuthorityState =>
    run(remote(), { type: "session-started", adopt: true })

  it("is allowed only for the account, and only once the person has said so", () => {
    expect(reportingAllowed(signedIn())).toBe(false)
    const on = run(signedIn(), { type: "reporting-set", on: true })
    expect(reportingAllowed(on)).toBe(true)
    // Learning on the device, or a session gone: not the account, not allowed.
    expect(reportingAllowed(run(on, { type: "chose", choice: "local" }))).toBe(
      false
    )
    expect(
      reportingAllowed(run(on, { type: "session-ended", forget: false }))
    ).toBe(false)
  })

  it("is a setting, not a change of authority", () => {
    const result = step(signedIn(), { type: "reporting-set", on: true })
    expect(result.authorityChanged).toBe(false)
    expect(result.state.epoch).toBe(signedIn().epoch)
    expect(step(result.state, { type: "reporting-set", on: true }).state).toBe(
      result.state
    )
  })

  it("is the device build's by construction, and nobody's with no server", () => {
    const device = run(initialState("in-process", null), {
      type: "session-learned",
      session: "signed-in",
    })
    expect(reportingAllowed(device)).toBe(true)
    const demo = run(initialState("none", null), {
      type: "reporting-set",
      on: true,
    })
    expect(demo.reporting).toBe(false)
    expect(reportingAllowed(demo)).toBe(false)
  })

  it("is only remembered for a build with a remote account", () => {
    expect(initialState("remote", "account", true).reporting).toBe(true)
    expect(initialState("none", "account", true).reporting).toBe(false)
    expect(initialState("in-process", null, true).reporting).toBe(false)
  })

  it("is forgotten at every boundary: a sign-in, a leaving, a switch", () => {
    const on = run(signedIn(), { type: "reporting-set", on: true })
    expect(run(on, { type: "session-started", adopt: false }).reporting).toBe(
      false
    )
    expect(run(on, { type: "session-ended", forget: true }).reporting).toBe(
      false
    )
    expect(run(on, { type: "chose", choice: "local" }).reporting).toBe(false)
    // An expiry is not the person leaving.
    expect(run(on, { type: "session-ended", forget: false }).reporting).toBe(
      true
    )
  })
})
