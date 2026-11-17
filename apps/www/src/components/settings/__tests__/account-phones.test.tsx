/**
 * @vitest-environment jsdom
 *
 * SIGNIN7 (#3095) on the lan web's Settings › Account: the phones paired
 * with this account, from a fake home, each by its name; one signed out
 * only after the confirm, with the list updated; and one renamed, with a
 * name home refuses said so.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { refusalOf } from "@/lib/auth/phones/home"
import type { Phone } from "@/lib/auth/phones/model"
import type { PhonesPorts } from "@/lib/auth/phones/runtime"
import { createPhones } from "@/lib/auth/phones/runtime"
import { FileHostResponseError } from "@/lib/file-host-config/client"
import { AccountPhones } from "@/components/settings/account-phones"

/** A home holding `phones`, which it changes as it is asked. */
function fakeHome(phones: Array<Phone>): {
  ports: PhonesPorts
  asked: Array<string>
} {
  const asked: Array<string> = []
  return {
    asked,
    ports: {
      list: (): Promise<ReadonlyArray<Phone>> => {
        asked.push("list")
        return Promise.resolve([...phones])
      },
      rename: (id, name): Promise<void> => {
        asked.push(`rename ${id} ${String(name)}`)
        if (name !== null && name.length > 40) {
          return Promise.reject(
            new FileHostResponseError(422, `/auth/phones/${id}`, null)
          )
        }
        const at = phones.findIndex((phone) => phone.id === id)
        if (at < 0) {
          return Promise.reject(
            new FileHostResponseError(404, `/auth/phones/${id}`, null)
          )
        }
        phones[at] = { ...phones[at], name }
        return Promise.resolve()
      },
      signOut: (id): Promise<void> => {
        asked.push(`signOut ${id}`)
        const at = phones.findIndex((phone) => phone.id === id)
        if (at < 0) {
          return Promise.reject(
            new FileHostResponseError(404, `/auth/phones/${id}`, null)
          )
        }
        phones.splice(at, 1)
        return Promise.resolve()
      },
      refusalOf,
    },
  }
}

const PIXEL: Phone = {
  id: "a",
  pairedOn: "2026-11-03",
  name: "Pixel",
  renewedAt: Date.UTC(2026, 10, 17, 9),
}
const OLD: Phone = { id: "b", pairedOn: null, name: null, renewedAt: 1 }

const list = (): HTMLElement =>
  screen.getByRole("list", { name: "Paired phones" })

afterEach(() => {
  cleanup()
})

describe("the lan web's paired phones", () => {
  it("lists each phone by its name, when it paired and when it was last used", async () => {
    const home = fakeHome([PIXEL, OLD])
    render(<AccountPhones make={() => createPhones(home.ports)} />)
    await screen.findByText("Pixel")
    expect(screen.getByText("Unnamed phone")).toBeTruthy()
    expect(screen.getByText("Paired Nov 3 · Used Nov 17 or later")).toBeTruthy()
    expect(screen.getByText(/^Paired before home kept the day · /)).toBeTruthy()
    expect(home.asked).toEqual(["list"])
  })

  it("signs a phone out only after the confirm, and updates the list", async () => {
    const home = fakeHome([PIXEL, OLD])
    render(<AccountPhones make={() => createPhones(home.ports)} />)
    await screen.findByText("Pixel")
    const row = within(list()).getByText("Pixel").closest("li")
    if (row === null) throw new Error("no row for Pixel")
    fireEvent.click(within(row).getByRole("button", { name: "Sign out" }))
    // Asked first, saying what stays, and nothing sent yet.
    expect(
      within(row).getByText(/^Sign out Pixel\? It keeps everything on it/)
    ).toBeTruthy()
    expect(home.asked).toEqual(["list"])
    fireEvent.click(
      within(row).getByRole("button", { name: "Keep it signed in" })
    )
    expect(home.asked).toEqual(["list"])
    fireEvent.click(within(row).getByRole("button", { name: "Sign out" }))
    fireEvent.click(
      within(row).getByRole("button", { name: "Yes, sign it out" })
    )
    await waitFor(() => expect(screen.queryByText("Pixel")).toBeNull())
    expect(await screen.findByText(/^Pixel is signed out\./)).toBeTruthy()
    expect(within(list()).getByText("Unnamed phone")).toBeTruthy()
    expect(home.asked).toEqual(["list", "signOut a", "list"])
  })

  it("renames a phone, and says when home won't keep the name", async () => {
    const home = fakeHome([OLD])
    render(<AccountPhones make={() => createPhones(home.ports)} />)
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }))
    const field = screen.getByLabelText("Name")
    // The field starts empty for an unnamed phone: nothing is filled in.
    expect(field instanceof HTMLInputElement ? field.value : null).toBe("")
    fireEvent.change(field, { target: { value: "  Kitchen  " } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByText("Named Kitchen.")
    expect(within(list()).getByText("Kitchen")).toBeTruthy()
    expect(home.asked).toContain("rename b Kitchen")
  })

  it("puts focus on what a press shows, and saves a name on Enter", async () => {
    const home = fakeHome([OLD])
    render(<AccountPhones make={() => createPhones(home.ports)} />)
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }))
    const field = screen.getByLabelText("Name")
    expect(document.activeElement).toBe(field)
    fireEvent.change(field, { target: { value: "Kitchen" } })
    fireEvent.submit(field)
    await screen.findByText("Named Kitchen.")
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Yes, sign it out" })
    )
  })

  it("won't send a name home would refuse, and says why", async () => {
    const home = fakeHome([OLD])
    render(<AccountPhones make={() => createPhones(home.ports)} />)
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }))
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "a".repeat(41) },
    })
    expect(screen.getByText(/^Home can't keep that name/)).toBeTruthy()
    const save = screen.getByRole("button", { name: "Save" })
    expect(save instanceof HTMLButtonElement && save.disabled).toBe(true)
    expect(home.asked).toEqual(["list"])
  })

  it("says so when this browser's sign-in with home has ended", async () => {
    const ports: PhonesPorts = {
      ...fakeHome([PIXEL]).ports,
      list: (): Promise<ReadonlyArray<Phone>> =>
        Promise.reject(new FileHostResponseError(401, "/auth/phones", null)),
    }
    render(<AccountPhones make={() => createPhones(ports)} />)
    expect(
      await screen.findByText(
        "This browser isn't signed in to home anymore. Sign in again to change your phones."
      )
    ).toBeTruthy()
  })

  it("keeps focus in the name field when home refuses the name", async () => {
    const home = fakeHome([OLD])
    const ports: PhonesPorts = {
      ...home.ports,
      rename: (id): Promise<void> =>
        Promise.reject(
          new FileHostResponseError(422, `/auth/phones/${id}`, null)
        ),
    }
    render(<AccountPhones make={() => createPhones(ports)} />)
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }))
    const field = screen.getByLabelText("Name")
    fireEvent.change(field, { target: { value: "Kitchen" } })
    fireEvent.submit(field)
    await screen.findByText(/^Home can't keep that name/, {
      selector: "[data-notice] *",
    })
    expect(document.activeElement).toBe(screen.getByLabelText("Name"))
  })

  it("says when home didn't give a list, and reads again on Try again", async () => {
    let fail = true
    const ports: PhonesPorts = {
      ...fakeHome([PIXEL]).ports,
      list: () =>
        fail
          ? Promise.reject(new Error("no answer"))
          : Promise.resolve([PIXEL]),
    }
    render(<AccountPhones make={() => createPhones(ports)} />)
    await screen.findByText("Your phones can't be listed just now.")
    fail = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Pixel")).toBeTruthy()
  })
})
