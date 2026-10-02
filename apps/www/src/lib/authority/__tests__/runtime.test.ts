/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest"

import type { AuthorityPorts } from "@/lib/authority/runtime"
import { createAuthority } from "@/lib/authority/runtime"
import { browserPorts } from "@/lib/authority/singleton"
import type { Choice } from "@/lib/authority/state"

function ports(
  stored: Choice | null = null,
  reporting = false
): AuthorityPorts & {
  written: Array<Choice>
  reported: Array<boolean>
  /** Another tab changed what is remembered. */
  elsewhere: (next: { choice?: Choice | null; reporting?: boolean }) => void
} {
  const written: Array<Choice> = []
  const reported: Array<boolean> = []
  const listeners = new Set<() => void>()
  let choice = stored
  let opted = reporting
  return {
    written,
    reported,
    readChoice: (): Choice | null => choice,
    writeChoice: (next): void => {
      choice = next
      written.push(next)
    },
    readReporting: (): boolean => opted,
    writeReporting: (on): void => {
      opted = on
      reported.push(on)
    },
    onRemoteChange: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    elsewhere: (next): void => {
      if (next.choice !== undefined) choice = next.choice
      if (next.reporting !== undefined) opted = next.reporting
      for (const listener of listeners) listener()
    },
  }
}

class MemoryStorage implements Storage {
  readonly data = new Map<string, string>()
  get length(): number {
    return this.data.size
  }
  clear(): void {
    this.data.clear()
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  key(): string | null {
    return null
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
}

/** Storage that refuses everything, as a blocked or quota-full one does. */
class HostileStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error("blocked")
  }
  override setItem(): void {
    throw new Error("blocked")
  }
}

describe("the runtime", () => {
  it("starts from the remembered choice", () => {
    expect(
      createAuthority("remote", ports("account")).getSnapshot().choice
    ).toBe("account")
    expect(createAuthority("remote", ports(null)).getSnapshot().choice).toBe(
      "local"
    )
  })

  it("hands React one identity until something changes", () => {
    const authority = createAuthority("remote", ports())
    const before = authority.getSnapshot()
    authority.dispatch({ type: "session-learned", session: "signed-out" })
    const after = authority.getSnapshot()
    expect(after).not.toBe(before)
    authority.dispatch({ type: "session-learned", session: "signed-out" })
    expect(authority.getSnapshot()).toBe(after)
  })

  it("remembers a choice when it changes, and only then", () => {
    const p = ports()
    const authority = createAuthority("remote", p)
    authority.chooseAccount()
    authority.chooseAccount()
    authority.chooseLocal()
    expect(p.written).toEqual(["account", "local"])
  })

  it("remembers nothing in a build where there is no choice to make", () => {
    for (const backend of ["none", "in-process"] as const) {
      const p = ports()
      const authority = createAuthority(backend, p)
      authority.chooseAccount()
      authority.chooseLocal()
      expect(p.written).toEqual([])
    }
  })

  it("tells authority listeners before it tells React", () => {
    const authority = createAuthority("remote", ports())
    const order: Array<string> = []
    authority.onAuthorityChange(() => order.push("cache cleared"))
    authority.subscribe(() => order.push("rendered"))
    authority.dispatch({ type: "session-started", adopt: true })
    expect(order).toEqual(["cache cleared", "rendered"])
  })

  it("does not announce a change that changed nothing", () => {
    const authority = createAuthority("remote", ports())
    const changed = vi.fn()
    const rendered = vi.fn()
    authority.onAuthorityChange(changed)
    authority.subscribe(rendered)
    authority.dispatch({ type: "session-learned", session: "signed-out" })
    expect(rendered).toHaveBeenCalledTimes(1)
    expect(changed).not.toHaveBeenCalled()
  })

  it("stops telling a listener that unsubscribed", () => {
    const authority = createAuthority("remote", ports())
    const rendered = vi.fn()
    const off = authority.subscribe(rendered)
    off()
    authority.chooseAccount()
    expect(rendered).not.toHaveBeenCalled()
  })
})

describe("a token from before a boundary is no longer current", () => {
  it("is current until the authority is a different one", () => {
    const authority = createAuthority("remote", ports())
    authority.dispatch({ type: "session-started", adopt: true })
    const token = authority.getAuthority()
    expect(authority.isCurrent(token)).toBe(true)
    authority.dispatch({ type: "session-learned", session: "signed-in" })
    expect(authority.isCurrent(token)).toBe(true)
  })

  it("is stale after a sign-out, and after a sign-in for another account", () => {
    const authority = createAuthority("remote", ports())
    authority.dispatch({ type: "session-started", adopt: true })
    const first = authority.getAuthority()
    authority.dispatch({ type: "session-ended", forget: false })
    expect(authority.isCurrent(first)).toBe(false)

    authority.dispatch({ type: "session-started", adopt: true })
    const second = authority.getAuthority()
    expect(second.kind).toBe("account")
    expect(authority.isCurrent(first)).toBe(false)
    expect(authority.isCurrent(second)).toBe(true)
  })

  it("reports which kind it is on", () => {
    const authority = createAuthority("remote", ports())
    expect(authority.is("local")).toBe(true)
    authority.dispatch({ type: "session-started", adopt: true })
    expect(authority.is("account")).toBe(true)
  })
})

describe("reporting", () => {
  function onAccount(p = ports()): ReturnType<typeof createAuthority> {
    const authority = createAuthority("remote", p)
    authority.dispatch({ type: "session-started", adopt: true })
    return authority
  }

  it("is off by default, and allowed only on the account once turned on", () => {
    const authority = onAccount()
    expect(authority.getSnapshot()).toMatchObject({
      reporting: false,
      reportingAllowed: false,
    })
    authority.setReporting(true)
    expect(authority.getSnapshot()).toMatchObject({
      reporting: true,
      reportingAllowed: true,
    })
  })

  it("is remembered, and written only when it changes", () => {
    const p = ports()
    const authority = onAccount(p)
    authority.setReporting(true)
    authority.setReporting(true)
    authority.setReporting(false)
    expect(p.reported).toEqual([true, false])
  })

  it("comes back after a reload for a returning account user, once the session is learned", () => {
    const authority = createAuthority("remote", ports("account", true))
    expect(authority.getSnapshot().reportingAllowed).toBe(false)
    authority.dispatch({ type: "session-learned", session: "signed-in" })
    expect(authority.getSnapshot().reportingAllowed).toBe(true)
  })

  it("does not change the authority, so nothing already fetched is dropped", () => {
    const authority = onAccount()
    const before = authority.getAuthority()
    const changes = vi.fn()
    authority.onAuthorityChange(changes)
    authority.setReporting(true)
    expect(authority.getAuthority()).toBe(before)
    expect(changes).not.toHaveBeenCalled()
  })

  it("is notified to subscribers, so the UI and the transports see it at once", () => {
    const authority = onAccount()
    const listener = vi.fn()
    authority.subscribe(listener)
    authority.setReporting(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("is forgotten by a sign-in, a sign-out and a switch to the device", () => {
    for (const leave of [
      (a: ReturnType<typeof createAuthority>): void =>
        a.dispatch({ type: "session-started", adopt: true }),
      (a: ReturnType<typeof createAuthority>): void =>
        a.dispatch({ type: "session-ended", forget: true }),
      (a: ReturnType<typeof createAuthority>): void => a.chooseLocal(),
    ]) {
      const authority = onAccount()
      authority.setReporting(true)
      leave(authority)
      expect(authority.getSnapshot().reporting).toBe(false)
    }
  })

  it("survives an expiry, which is not the person leaving, but is not allowed while it lasts", () => {
    const authority = onAccount()
    authority.setReporting(true)
    authority.dispatch({ type: "session-ended", forget: false })
    expect(authority.getSnapshot()).toMatchObject({
      reporting: true,
      reportingAllowed: false,
    })
  })

  it("has nothing to turn on where there is no remote account", () => {
    for (const backend of ["none", "in-process"] as const) {
      const authority = createAuthority(backend, ports())
      authority.setReporting(true)
      expect(authority.getSnapshot().reporting).toBe(false)
    }
  })

  it("is not asked of the device build, whose backend never leaves the phone", () => {
    const authority = createAuthority("in-process", ports())
    authority.dispatch({ type: "session-learned", session: "signed-in" })
    expect(authority.getSnapshot().reportingAllowed).toBe(true)
  })

  it("is not allowed while learning on the device, whatever was remembered", () => {
    const authority = createAuthority("remote", ports("local", true))
    authority.dispatch({ type: "session-learned", session: "signed-in" })
    expect(authority.getSnapshot().reportingAllowed).toBe(false)
  })
})

describe("another tab of the same browser", () => {
  function onAccount(
    p = ports()
  ): [ReturnType<typeof createAuthority>, ReturnType<typeof ports>] {
    const authority = createAuthority("remote", p)
    authority.dispatch({ type: "session-started", adopt: true })
    return [authority, p]
  }

  it("turning reporting off there turns it off here, at once", () => {
    const [authority, p] = onAccount()
    authority.setReporting(true)
    expect(authority.getSnapshot().reportingAllowed).toBe(true)

    p.elsewhere({ reporting: false })

    expect(authority.getSnapshot()).toMatchObject({
      reporting: false,
      reportingAllowed: false,
    })
  })

  it("switching to the device there moves this tab to the device, and forgets the opt-in", () => {
    const [authority, p] = onAccount()
    authority.setReporting(true)
    const changes = vi.fn()
    authority.onAuthorityChange(changes)

    p.elsewhere({ choice: "local", reporting: false })

    expect(authority.getAuthority().kind).toBe("local")
    expect(authority.getSnapshot().reporting).toBe(false)
    // A different authority: whatever the account's fetched is dropped.
    expect(changes).toHaveBeenCalledTimes(1)
  })

  it("does not copy the other direction: opting in or choosing the account there is that tab's own act", () => {
    const p = ports()
    const authority = createAuthority("remote", p)
    p.elsewhere({ choice: "account", reporting: true })
    expect(authority.getSnapshot()).toMatchObject({
      choice: "local",
      reporting: false,
    })
    expect(authority.getAuthority().kind).toBe("local")
  })

  it("ignores a change that leaves things as they were, and a build with no choice to share", () => {
    const [authority, p] = onAccount()
    const listener = vi.fn()
    authority.subscribe(listener)
    p.elsewhere({ choice: "account", reporting: false })
    expect(listener).not.toHaveBeenCalled()

    const device = createAuthority("in-process", ports())
    expect(() => device.getSnapshot()).not.toThrow()
  })
})

describe("browser ports", () => {
  function storage(initial?: string): MemoryStorage {
    const s = new MemoryStorage()
    if (initial !== undefined) s.data.set("some-ui.authority.v1", initial)
    return s
  }

  it("round-trips a choice", () => {
    const s = storage()
    const p = browserPorts(s)
    expect(p.readChoice()).toBeNull()
    p.writeChoice("account")
    expect(p.readChoice()).toBe("account")
  })

  it("keeps the choice and the reporting opt-in side by side", () => {
    const s = storage()
    const p = browserPorts(s)
    p.writeChoice("account")
    p.writeReporting(true)
    p.writeChoice("local")
    expect(p.readChoice()).toBe("local")
    expect(p.readReporting()).toBe(true)
    expect(JSON.parse(s.data.get("some-ui.authority.v1") ?? "null")).toEqual({
      choice: "local",
      reporting: true,
    })
  })

  it("reads anything but an explicit true as not opted in", () => {
    for (const raw of ["not json", "null", '{"reporting":"yes"}', "{}", "[]"]) {
      expect(browserPorts(storage(raw)).readReporting()).toBe(false)
    }
  })

  it("reads garbage, a wrong shape and a wrong value as no choice", () => {
    for (const raw of [
      "not json",
      "null",
      "[]",
      '{"choice":"both"}',
      '{"choice":3}',
      "{}",
    ]) {
      expect(browserPorts(storage(raw)).readChoice()).toBeNull()
    }
  })

  it("tells a listener when another tab writes the record, and not about other keys", () => {
    const p = browserPorts(storage())
    const listener = vi.fn()
    const off = p.onRemoteChange(listener)
    window.dispatchEvent(
      new StorageEvent("storage", { key: "some-ui.authority.v1" })
    )
    window.dispatchEvent(new StorageEvent("storage", { key: "something-else" }))
    // `clear()` in another tab arrives with no key.
    window.dispatchEvent(new StorageEvent("storage", { key: null }))
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    window.dispatchEvent(
      new StorageEvent("storage", { key: "some-ui.authority.v1" })
    )
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("survives storage that throws or does not exist", () => {
    const hostile = new HostileStorage()
    const p = browserPorts(hostile)
    expect(p.readChoice()).toBeNull()
    expect(() => p.writeChoice("account")).not.toThrow()
    const none = browserPorts(undefined)
    expect(none.readChoice()).toBeNull()
    expect(() => none.writeChoice("local")).not.toThrow()
  })
})

describe("settled", () => {
  it("resolves at once for anyone whose authority is already decided", async () => {
    // The device, and a build with no server at all, whatever was remembered.
    await expect(
      createAuthority("remote", ports()).settled()
    ).resolves.toBeUndefined()
    await expect(
      createAuthority("none", ports("account")).settled()
    ).resolves.toBeUndefined()
  })

  it("waits while a returning account user's authority is undecided, then resolves", async () => {
    const authority = createAuthority("remote", ports("account"))
    expect(authority.getAuthority().kind).toBe("pending")

    let done = false
    const waiting = authority.settled().then(() => {
      done = true
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(done).toBe(false)

    authority.dispatch({ type: "session-learned", session: "signed-out" })
    await waiting
    expect(done).toBe(true)
  })

  it("stops listening once it has resolved", async () => {
    const authority = createAuthority("remote", ports("account"))
    const waiting = authority.settled()
    authority.dispatch({ type: "session-learned", session: "signed-in" })
    await waiting
    // Another change must not re-run a resolved waiter or throw.
    expect(() =>
      authority.dispatch({ type: "session-ended", forget: false })
    ).not.toThrow()
  })
})
