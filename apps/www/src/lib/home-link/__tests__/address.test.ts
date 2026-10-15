import { describe, expect, it } from "vitest"

import { pairingAddress, typedCode } from "@/lib/home-link/address"

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
