/** @vitest-environment node */
import { youtubeLink } from "@core-utils/lib/youtube"
import { describe, expect, it } from "vitest"

const LINK = "https://youtu.be/dQw4w9WgXcQ"

describe("youtubeLink", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", LINK],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", LINK],
    [" https://youtube.com/shorts/dQw4w9WgXcQ ", LINK],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", LINK],
    ["http://youtu.be/dQw4w9WgXcQ", null],
    ["https://youtu.be/short", null],
    ["https://youtube.com/channel/UC123", null],
    ["not a link", null],
  ])("reads %j as %j", (text, link) => {
    expect(youtubeLink(text)).toBe(link)
  })
})
