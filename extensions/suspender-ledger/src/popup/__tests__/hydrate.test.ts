// Copyright (c) 2026 paulgsc — MIT License

import { settleEach } from "@suspender/popup/hydrate"
import { describe, expect, it } from "vitest"

type Reads = {
  tab: number
  settings: number
  shortcuts: number
  "kept-awake": number
}

describe("settleEach", () => {
  it("names a read that throws before it returns a promise, and answers the rest", async () => {
    const settled = await settleEach<Reads>({
      tab: () => Promise.resolve(1),
      settings: (): Promise<number> => {
        throw new Error("unavailable")
      },
      shortcuts: () => Promise.reject(new Error("unavailable")),
    })

    expect(settled).toEqual({
      answered: { tab: 1 },
      failed: ["settings", "shortcuts"],
    })
  })
})
