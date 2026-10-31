/** @vitest-environment node */
import { sha256Hex } from "@core-utils/lib/sha256"
import { describe, expect, it } from "vitest"

describe("sha256Hex", () => {
  it("hashes text as its UTF-8 bytes, and bytes as they are", async () => {
    const abc =
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    expect(await sha256Hex("abc")).toBe(abc)
    expect(await sha256Hex(new TextEncoder().encode("abc").buffer)).toBe(abc)
    expect(await sha256Hex("한")).toBe(
      await sha256Hex(new Uint8Array([0xed, 0x95, 0x9c]).buffer)
    )
  })
})
