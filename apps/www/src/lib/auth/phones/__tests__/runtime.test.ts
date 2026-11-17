/**
 * The phone list's runtime (SIGNIN7): the newest read's answer is the one
 * kept, whichever lands first; a sign-out reads the list again; and the
 * ports' parse and refusals read home's answers as the screen needs them.
 */
import { describe, expect, it } from "vitest"

import { phonesFrom, refusalOf } from "@/lib/auth/phones/home"
import type { Phone } from "@/lib/auth/phones/model"
import { phonesOf as shown } from "@/lib/auth/phones/model"
import type { PhonesPorts } from "@/lib/auth/phones/runtime"
import { createPhones } from "@/lib/auth/phones/runtime"
import { FileHostResponseError } from "@/lib/file-host-config/client"

const A: Phone = {
  id: "a",
  pairedOn: "2026-11-03",
  name: "Pixel",
  renewedAt: 1,
}
const B: Phone = { id: "b", pairedOn: null, name: null, renewedAt: 2 }

type Held<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function held<T>(): Held<T> {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

/** Ports whose every call is held until the test answers it. */
function heldHome(): {
  ports: PhonesPorts
  lists: Array<Held<ReadonlyArray<Phone>>>
  signOuts: Array<{ id: string; answer: Held<void> }>
  renames: Array<{ id: string; name: string | null; answer: Held<void> }>
} {
  const lists: Array<Held<ReadonlyArray<Phone>>> = []
  const signOuts: Array<{ id: string; answer: Held<void> }> = []
  const renames: Array<{
    id: string
    name: string | null
    answer: Held<void>
  }> = []
  return {
    lists,
    signOuts,
    renames,
    ports: {
      list: (): Promise<ReadonlyArray<Phone>> => {
        const answer = held<ReadonlyArray<Phone>>()
        lists.push(answer)
        return answer.promise
      },
      rename: (id, name): Promise<void> => {
        const answer = held<void>()
        renames.push({ id, name, answer })
        return answer.promise
      },
      signOut: (id): Promise<void> => {
        const answer = held<void>()
        signOuts.push({ id, answer })
        return answer.promise
      },
      refusalOf,
    },
  }
}

describe("the phone list (runtime)", () => {
  it("keeps the newest read's answer, whichever lands first", async () => {
    const home = heldHome()
    const phones = createPhones(home.ports)
    phones.read()
    phones.read()
    home.lists[1]?.resolve([A])
    await settle()
    home.lists[0]?.resolve([A, B])
    await settle()
    expect(shown(phones.getSnapshot().list)).toEqual([A])
    // A failed older read says nothing either.
    phones.read()
    phones.read()
    home.lists[3]?.resolve([B])
    await settle()
    home.lists[2]?.reject(new Error("no answer"))
    await settle()
    expect(phones.getSnapshot().list).toEqual({ kind: "read", phones: [B] })
  })

  it("signs a phone out after the confirm, then reads the list again", async () => {
    const home = heldHome()
    const phones = createPhones(home.ports)
    phones.read()
    home.lists[0]?.resolve([A, B])
    await settle()
    phones.signOutPressed("b")
    expect(home.signOuts).toHaveLength(0)
    phones.confirm()
    expect(home.signOuts.map(({ id }) => id)).toEqual(["b"])
    home.signOuts[0]?.answer.resolve()
    await settle()
    expect(shown(phones.getSnapshot().list)).toEqual([A])
    expect(home.lists).toHaveLength(2)
    // Home's own list, read after, is the one kept.
    home.lists[1]?.resolve([A])
    await settle()
    expect(phones.getSnapshot().list).toEqual({ kind: "read", phones: [A] })
  })

  it("sends a name once, as taken, and says why home refused it", async () => {
    const home = heldHome()
    const phones = createPhones(home.ports)
    phones.read()
    home.lists[0]?.resolve([A])
    await settle()
    phones.renamePressed("a")
    phones.save("Kitchen")
    // A second press while saving sends nothing more.
    phones.save("Kitchen")
    expect(home.renames.map(({ id, name }) => [id, name])).toEqual([
      ["a", "Kitchen"],
    ])
    home.renames[0]?.answer.reject(
      new FileHostResponseError(422, "/auth/phones/a", "unprocessable_entity", {
        method: "PATCH",
        detail: null,
      })
    )
    await settle()
    expect(phones.getSnapshot().said).toEqual({
      kind: "notNamed",
      why: "refused",
    })
  })
})

describe("a rename beside a read already asked", () => {
  it("reads again once the name is saved, so an older read can't put the old name back", async () => {
    const home = heldHome()
    const phones = createPhones(home.ports)
    phones.read()
    home.lists[0]?.resolve([A])
    await settle()
    // A read goes out (a sign-out's, say), and the rename lands first.
    phones.read()
    phones.renamePressed("a")
    phones.save("Kitchen")
    home.renames[0]?.answer.resolve()
    await settle()
    expect(home.lists).toHaveLength(3)
    // The older read, holding the old name, lands and is dropped.
    home.lists[1]?.resolve([A])
    await settle()
    expect(shown(phones.getSnapshot().list)?.[0]?.name).toBe("Kitchen")
    home.lists[2]?.resolve([{ ...A, name: "Kitchen" }])
    await settle()
    expect(shown(phones.getSnapshot().list)?.[0]?.name).toBe("Kitchen")
  })
})

describe("home's answers, as the list reads them", () => {
  it("reads home's list, and refuses one that isn't", () => {
    expect(
      phonesFrom({
        phones: [
          {
            phoneId: "AAAA",
            pairedOn: "2026-11-03",
            label: "Pixel",
            renewedAt: 5,
            expiresAt: 9,
          },
          {
            phoneId: "BBBB",
            pairedOn: null,
            label: null,
            renewedAt: 6,
            expiresAt: 9,
          },
        ],
      })
    ).toEqual([
      { id: "AAAA", pairedOn: "2026-11-03", name: "Pixel", renewedAt: 5 },
      { id: "BBBB", pairedOn: null, name: null, renewedAt: 6 },
    ])
    expect(() => phonesFrom({ phones: [{ label: "x" }] })).toThrow()
    expect(() => phonesFrom(null)).toThrow()
  })

  it("reads a 404 as gone, a 422 as refused, a 401 as signed out, and anything else as failed", () => {
    const answered = (status: number): FileHostResponseError =>
      new FileHostResponseError(status, "/auth/phones/a", null, {
        method: "DELETE",
        detail: null,
      })
    expect(refusalOf(answered(404))).toBe("gone")
    expect(refusalOf(answered(422))).toBe("refused")
    // This browser's own sign-in ended: home did answer.
    expect(refusalOf(answered(401))).toBe("signedOut")
    expect(refusalOf(answered(403))).toBe("failed")
    expect(refusalOf(answered(500))).toBe("failed")
    expect(refusalOf(new Error("no answer"))).toBe("failed")
  })
})
