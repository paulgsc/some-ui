// @vitest-environment node
import { bite } from "@soundbites/lib/__tests__/fixture"
import {
  audioFileName,
  NOTES_FILE,
  shareNotes,
  soundbiteShare,
} from "@soundbites/lib/share"
import type { Soundbite } from "@soundbites/lib/types"
import { describe, expect, it } from "vitest"

const FROM_REMINDER: Soundbite = {
  ...bite("1a2b3c4d-ffff", 0),
  durationMs: 23_400,
  mimeType: "audio/webm;codecs=opus",
  context: {
    source: "reminder",
    lastSessionAt: "2026-09-28T09:00:00.000Z",
    openSessions: 2,
    timeZone: "America/New_York",
  },
}

describe("audioFileName", () => {
  it("names a recording by when it was said, its id, and what it holds", () => {
    expect(audioFileName(FROM_REMINDER)).toBe(
      "soundbite-20261001T120000Z-1a2b3c4d.webm"
    )
    expect(audioFileName({ ...FROM_REMINDER, mimeType: "audio/mp4" })).toMatch(
      /\.m4a$/
    )
    expect(audioFileName({ ...FROM_REMINDER, mimeType: "" })).toMatch(/\.bin$/)
  })
})

describe("shareNotes", () => {
  it("says what the recordings are, and what the app noted around each", () => {
    const notes = shareNotes([FROM_REMINDER, bite("b", 60)])

    expect(notes).toMatch(/^# Soundbites from Some UI\n/)
    expect(notes).toContain("why a study session did not happen")
    expect(notes).toContain(
      [
        "## soundbite-20261001T120000Z-1a2b3c4d.webm",
        "",
        "- Recorded: 2026-10-01T12:00:00.000Z (Thu, Oct 1, 08:00, America/New_York)",
        "- Length: 0:23",
        '- Opened from: the "Not today" action on a study reminder notification',
        "- Last session activity: 2026-09-28T09:00:00.000Z (3 days before this)",
        "- Sessions open (started, not finished): 2",
        "- Audio: audio/webm;codecs=opus, 4000 bytes",
      ].join("\n")
    )
    expect(notes).toContain("- Last session activity: none yet")
  })

  it("still writes the notes when the phone's time zone is unknown", () => {
    const odd = {
      ...FROM_REMINDER,
      context: { ...FROM_REMINDER.context, timeZone: "Not/AZone" },
    }
    expect(shareNotes([odd])).toContain(
      "- Recorded: 2026-10-01T12:00:00.000Z\n"
    )
  })
})

describe("soundbiteShare", () => {
  it("sends each recording's audio as it is, then the notes", async () => {
    const audio = new Blob(["voice"], { type: "audio/webm" })
    const share = soundbiteShare([{ bite: FROM_REMINDER, audio }])

    expect(share.title).toBe("A soundbite from Some UI")
    expect(share.files.map((file) => [file.name, file.mimeType])).toEqual([
      [audioFileName(FROM_REMINDER), "audio/webm;codecs=opus"],
      [NOTES_FILE, "text/markdown"],
    ])
    expect(share.files[0]?.data).toBe(audio)
    expect(await share.files[1]?.data.text()).toBe(shareNotes([FROM_REMINDER]))
  })
})
