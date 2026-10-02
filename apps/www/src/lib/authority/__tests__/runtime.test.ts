import { describe, expect, it, vi } from "vitest"

import type { AuthorityPorts } from "@/lib/authority/runtime"
import { createAuthority } from "@/lib/authority/runtime"
import { browserPorts } from "@/lib/authority/singleton"
import type { Choice } from "@/lib/authority/state"

function ports(
  stored: Choice | null = null
): AuthorityPorts & { written: Array<Choice> } {
  const written: Array<Choice> = []
  return {
    written,
    readChoice: (): Choice | null => stored,
    writeChoice: (choice): void => {
      written.push(choice)
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
