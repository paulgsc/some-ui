import { describe, expect, it } from "vitest"

import {
  addressOf,
  homeWebPage,
  pairingAddress,
  typedCode,
} from "@/lib/home-link/address"

describe("pairingAddress", () => {
  it("reads a bare host, a proxy path or a full base as an https API base", () => {
    expect(pairingAddress(" file-host.home.example ")).toEqual({
      base: "https://file-host.home.example/api/v1",
      host: "file-host.home.example",
    })
    expect(
      pairingAddress("https://www.home.example/api/file-host/api/v1/")
    ).toEqual({
      base: "https://www.home.example/api/file-host/api/v1",
      host: "www.home.example",
    })
    expect(pairingAddress("https://www.home.example/api/file-host")).toEqual({
      base: "https://www.home.example/api/file-host/api/v1",
      host: "www.home.example",
    })
  })

  it("never pairs over plain http", () => {
    expect(pairingAddress("http://192.168.1.10:3000")).toBe("not-https")
    expect(pairingAddress("ftp://home.example")).toBe("not-https")
    expect(pairingAddress("")).toBe("empty")
    expect(pairingAddress("https://")).toBe("invalid")
  })
})

describe("typedCode", () => {
  it("reads a code the way the server does", () => {
    expect(typedCode("k7qf-2m9x")).toBe("K7QF2M9X")
    expect(typedCode(" o1il 0000\n")).toBe("01110000")
  })

  it("is nothing until it can be a code", () => {
    for (const text of ["", "K7QF2M9", "K7QF2M9XY", "K7QF2M9U"]) {
      expect(typedCode(text), text).toBeNull()
    }
  })
})

describe("a stored base as an address to type again (SIGNIN3)", () => {
  it("keeps the scheme, the host and a proxy's path, and pairs at the same base", () => {
    for (const base of [
      "https://home.example/api/v1",
      "https://www.home.example/api/file-host/api/v1",
      "https://home.example:8443/api/v1",
    ]) {
      const typed = addressOf(base)
      expect(typed).not.toMatch(/\/api\/v1$/)
      expect(pairingAddress(typed)).toMatchObject({ base })
    }
  })
})

describe("homeWebPage", () => {
  it("finds home's web app at the origin the phone paired through", () => {
    expect(
      homeWebPage("https://www.home.example/api/file-host/api/v1", "/cooking")
    ).toBe("https://www.home.example/cooking")
  })

  it("knows no web app for a base paired straight to home, or over http", () => {
    expect(
      homeWebPage("https://file-host.home.example/api/v1", "/cooking")
    ).toBeNull()
    expect(
      homeWebPage("http://www.home.example/api/file-host/api/v1", "/cooking")
    ).toBeNull()
  })
})
