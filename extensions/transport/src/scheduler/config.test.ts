import { describe, expect, it } from "vitest"

import { declaredR, type SchedulerConfig } from "./config"

describe("scheduler/config — declaredR (Definition 7.2's R)", () => {
  it("is a single, discoverable accessor for the configured bound", () => {
    const config: SchedulerConfig = {
      reconcile: { debounceMs: 50 },
      poll: {
        initialDelayMs: 500,
        maxDelayMs: 500,
        factor: 1,
        maxAttempts: 100,
      },
      boundedDeliveryMs: 2000,
    }
    expect(declaredR(config)).toBe(2000)
  })
})
