import { AuthorshipRecord } from "@burn-ins/components/authorship-record"
import { recordCode } from "@burn-ins/lib/authorship-link"
import { WORDS } from "@burn-ins/lib/words"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const scenes = [
  { origin: "you", wording: "you", hands: ["you", "code"] },
  { origin: "agent", wording: "agent", hands: ["agent"] },
] as const

describe("the record page", () => {
  it("draws the key, and the video's record from its link", () => {
    const record = scenes.map((s) => ({ ...s, hands: [...s.hands] }))
    render(<AuthorshipRecord code={recordCode(record)} />)
    expect(
      screen.getByRole("img", { name: WORDS.record.keyLabel })
    ).toBeTruthy()
    expect(
      screen.getByRole("img", { name: WORDS.record.recordLabel })
    ).toBeTruthy()
  })

  it("says so when a link is longer than any record", () => {
    render(<AuthorshipRecord code={"A".repeat(25)} />)
    expect(screen.getByText(WORDS.record.tooLong)).toBeTruthy()
  })

  it("says so when the link carries no record", () => {
    for (const code of [undefined, "", "!!"]) {
      const { unmount } = render(<AuthorshipRecord code={code} />)
      expect(screen.getByText(WORDS.record.noRecord)).toBeTruthy()
      unmount()
    }
  })
})
