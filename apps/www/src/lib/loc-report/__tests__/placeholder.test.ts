import { describe, expect, it } from "vitest"

import { locSnapshot } from "@/lib/loc-report/snapshot"

describe("the tracked snapshot", () => {
  it("is the empty placeholder, not numbers someone generated locally", () => {
    // `pnpm loc:snapshot` overwrites this file, and the pipelines overwrite it
    // right before a build; what is committed must stay the placeholder, or
    // every build ships a stale count (of a private repository, if the server
    // was included). Reset it with:
    //   git checkout apps/www/src/generated/loc-snapshot.json
    expect(locSnapshot).toBeNull()
  })
})
