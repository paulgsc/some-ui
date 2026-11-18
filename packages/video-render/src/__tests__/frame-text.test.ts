import { linesOf } from "@video-render/frame-text"
import { describe, expect, it } from "vitest"

const WIDTHS = Array.from({ length: 120 }, (_, i) => 40 + i * 6)

describe("linesOf: where a line may break between runs", () => {
  it("breaks between two runs as at a space, as the call's ref and title are drawn", () => {
    for (const width of WIDTHS)
      expect(
        linesOf(
          [
            { text: "some-ui#3188", face: "prose", em: 1 },
            { text: "Woodworking windows", face: "prose", em: 1 },
          ],
          width
        ),
        String(width)
      ).toBe(
        linesOf(
          [{ text: "some-ui#3188 Woodworking windows", face: "prose", em: 1 }],
          width
        )
      )
  })

  it('keeps a run that touches the one before in its word, as "`Vec`;" is drawn', () => {
    for (const width of WIDTHS)
      expect(
        linesOf(
          [
            { text: "Woodworking Vec", face: "prose", em: 1 },
            { text: "; windows", face: "prose", em: 1, touches: true },
          ],
          width
        ),
        String(width)
      ).toBe(
        linesOf(
          [{ text: "Woodworking Vec; windows", face: "prose", em: 1 }],
          width
        )
      )
  })
})
