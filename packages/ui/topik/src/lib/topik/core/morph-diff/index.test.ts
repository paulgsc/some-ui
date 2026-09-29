import { describe, expect, it } from "vitest"

import { diffUtterance, highlightFor } from "."

const render = (
  segments: ReturnType<typeof diffUtterance>["segments"]
): string =>
  segments
    .map(({ kind, text }) =>
      kind === "added" ? `[+${text}]` : kind === "removed" ? `[-${text}]` : text
    )
    .join("")

describe("diffUtterance", () => {
  it("isolates a tense change to the syllables it touches", () => {
    expect(
      render(diffUtterance("가사가 예뻐요", "가사가 예뻤어요").segments)
    ).toBe("가사가 예[-뻐][+뻤어]요")
  })

  it("shows an inserted negator as an insertion", () => {
    expect(
      render(diffUtterance("가사가 예뻐요", "가사가 안 예뻐요").segments)
    ).toBe("가사가 [+안 ]예뻐요")
  })

  it("reads the candidate back out of its same and added segments", () => {
    const { segments } = diffUtterance("카드로 할게요.", "카드로 했어요.")
    const candidate = segments
      .filter((s) => s.kind !== "removed")
      .map((s) => s.text)
      .join("")
    expect(candidate).toBe("카드로 했어요.")
  })

  it("scores similarity on visible syllables", () => {
    expect(diffUtterance("abc", "abc").similarity).toBe(1)
    expect(diffUtterance("가나", "다라").similarity).toBe(0)
  })
})

describe("highlightFor", () => {
  it("highlights a morphological variant", () => {
    expect(highlightFor("카드로 할게요.", "카드로 안 할게요.")).not.toBeNull()
  })

  it("declines to highlight a different sentence, an empty source, or no change", () => {
    expect(
      highlightFor(
        "어서 오세요. 뭐 드릴까요?",
        "아이스 아메리카노 한 잔 주세요."
      )
    ).toBeNull()
    expect(highlightFor("", "카드로 할게요.")).toBeNull()
    expect(highlightFor("카드로 할게요.", "카드로 할게요.")).toBeNull()
  })
})
