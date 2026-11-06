/**
 * Promise HS1, for topik's handheld lesson: the phone's TOPIK, what
 * `chooseSurface` mounts under 768px wide or 480px tall (`./stays-put.spec.ts`
 * holds the claim).
 * - Family: every tap each walk below takes, at each of `PHONE_VIEWPORTS`
 *   (the phone held sideways among them); for Write your own drama, an ask
 *   for the next scene kept and refused, a copy the clipboard refused and
 *   its by-hand confirm, a reply pasted, read, typed into and read again; for
 *   the drama, every rung of a line from the dock and from its bubble, the
 *   cover's English, Listen, Next between beats, Next's place as a choice
 *   opens (where the thumb that tapped it still is), and at its ending an
 *   ask kept and refused, the author's notes and a why opened, review
 *   answers, its English shown and hidden, and a typed wish; for the grammar
 *   lens, a file that is no word set, a revealed item's situations picked,
 *   changed and taken back, and two takes of its line kept and one played;
 *   for read aloud, Stuck, Pause, Resume and Skip on its rep card, whose
 *   steps run on a clock between the taps. A tap that declares `reflows`
 *   (another screen or a step) is outside it, and says why; one that
 *   declares `grows` (what was asked for, below the tap) holds what is at
 *   and above the tap.
 * - Proof: this spec, over `../layout-invariants/stays-put.ts`.
 */

import { fileURLToPath } from "node:url"
import { expect, type Page } from "@playwright/test"
import {
  button,
  keepWrites,
  refuseWrites,
  type Tap,
} from "@tests/layout-invariants/stays-put"

import { walkEachPhone } from "./harness"

/** The grammar lens's level-one set, as the learner picks it from storage. */
const LENS_SET = fileURLToPath(
  new URL(
    "../../../../packages/some-content/prompts/read-aloud-generator/sets/level-one.lens.json",
    import.meta.url
  )
)

/**
 * A two-scene drama, pasted as a model's reply: a narration and a line, a
 * choice of two replies, and one line after each.
 */
const TREE = {
  id: "fit-walk",
  level: 2,
  pov: "seoyeon",
  cast: [
    { id: "seoyeon", name: "윤서연", standing: "the fiancée", registers: {} },
    {
      id: "chairman",
      name: "강 회장님",
      standing: "his mother",
      registers: {},
    },
  ],
  root: {
    id: "s1",
    place: "회장님 댁 거실",
    feeling: "fury",
    beats: [
      {
        id: "s1-n1",
        text: "서연이 처음으로 회장님 댁에 와서 소파 끝에 조심스럽게 앉았다.",
        gloss: "Seo-yeon has come to the chairman's house for the first time.",
      },
      {
        id: "s1-l1",
        speaker: "chairman",
        text: "우리 집안에 들어오려면 그 정도 각오는 하고 왔겠지? 대답해 봐.",
        gloss: "You came ready for that, if you mean to join this family?",
        direction: "setting her cup down hard",
      },
    ],
    choice: {
      id: "c1",
      prompt: "서연은 회장님께 뭐라고 대답해야 할까?",
      check: {
        id: "c1-reply",
        kind: "pick-valid",
        order: 2,
        source: "우리 집안에 들어오려면 그 정도 각오는 하고 왔겠지? 대답해 봐.",
        prompt: "Which reply fits, to the chairman?",
        options: [
          {
            id: "a",
            text: "네, 회장님. 부족하지만 각오는 단단히 하고 왔습니다.",
            relation: "reply",
            valid: true,
            why: "Formal -습니다 answers an elder's challenge, and it does so without backing down from it.",
          },
          {
            id: "b",
            text: "응, 당연하지. 그런 거 다 알고 왔어.",
            relation: "reply",
            valid: false,
            why: "반말 to an elder at a first meeting is rude.",
          },
        ],
      },
      options: ["a", "b"].map((id) => ({
        id,
        child: {
          id: `s-${id}`,
          place: "회장님 댁 거실",
          feeling: id === "a" ? "warmth" : "chill",
          beats: [
            {
              id: `s-${id}-l1`,
              speaker: "chairman",
              text: "그래, 어디 한번 두고 보자. 말보다 행동이 중요한 법이니까.",
              gloss: "Fine, we shall see. Deeds matter more than words.",
            },
          ],
        },
      })),
    },
  },
}

/** A string names a button whole here: "Listen" is not "Listen first". */
const EXACT = { exact: true } as const

/** From here on, the clipboard refuses what is copied to it. */
const refuseClipboard: Tap = {
  does: "the clipboard stops taking text",
  act: (page): Promise<void> =>
    page.evaluate(() => {
      navigator.clipboard.writeText = (): Promise<void> =>
        Promise.reject(new DOMException("denied", "NotAllowedError"))
    }),
}

const reply = (page: Page): ReturnType<Page["getByRole"]> =>
  page.getByRole("textbox", { name: "Your model's reply" })

/** Write your own drama: the prompt handed out, and the reply taken back. */
const GENERATE: ReadonlyArray<Tap> = [
  {
    ...button(/^Write your own drama/, "opens Write your own drama"),
    reflows: "screen: Write your own drama",
  },
  button("Ask for the next scene", "asks home for the next scene", EXACT),
  refuseWrites,
  button("Ask for the next scene", "asks again, refused", EXACT),
  keepWrites,
  refuseClipboard,
  button(/^Copy the prompt/, "copies the prompt, refused by the clipboard"),
  button(/copied it/, "says the prompt was copied by hand"),
  {
    does: "pastes the reply",
    act: (page) => reply(page).fill(JSON.stringify(TREE)),
  },
  button("Read the reply", "reads the reply", EXACT),
  {
    does: "types a key into the reply",
    act: async (page): Promise<void> => {
      await reply(page).press("End")
      await reply(page).press("Space")
    },
  },
  button("Read the reply", "reads it again", EXACT),
]

/** The drama the reply holds, from its first beat to its ending. */
const DRAMA: ReadonlyArray<Tap> = [
  { ...button(/Start/, "starts the drama"), reflows: "screen: the drama" },
  button("Listen", "listens to the narration", EXACT),
  button("Show Korean", "shows the narration's Korean", EXACT),
  button("Show English", "shows the narration's English", EXACT),
  {
    ...button(/show English$/, "shows the cover's English"),
    grows: "the cover's English, below its caption",
  },
  button(/^Next/, "goes on to the chairman's line"),
  {
    ...button(/^Listen first/, "taps the line for its Korean"),
    grows: "the line's Korean, in place of Listen first and below it",
  },
  {
    ...button(/^우리 집안에/, "taps the line again for its English"),
    grows: "the line's English, below its Korean",
  },
  {
    // The dock is the choice's now, so no box is compared; what is checked is
    // the place Next was, where a thumb still tapping Next lands.
    does: "goes on to the choice, and Next's place holds no control",
    act: async (page): Promise<void> => {
      const next = page.getByRole("button", { name: "Next", exact: true })
      const box = await next.boundingBox()
      if (box === null) throw new Error("Next is not on the screen")
      await next.click()
      await expect(page.getByRole("group", { name: "Choose" })).toBeVisible()
      const under = await page.evaluate(
        ([x, y]) =>
          document.elementFromPoint(x, y)?.closest("button")?.ariaLabel ??
          document.elementFromPoint(x, y)?.closest("button")?.textContent ??
          null,
        [box.x + box.width / 2, box.y + box.height / 2] as const
      )
      expect
        .soft(under, "a tap where Next was lands on this control")
        .toBeNull()
    },
    reflows: "step: the choice, asked in the dock",
  },
  {
    ...button(/^네, 회장님/, "answers the chairman"),
    reflows: "step: the scene the answer leads to",
  },
  {
    ...button(/^Next/, "goes on to the ending"),
    reflows: "step: the ending, with its own dock",
  },
  button("다음 화 쓰기", "asks for the next episode", EXACT),
  refuseWrites,
  button("다음 화 쓰기", "asks again, refused", EXACT),
  keepWrites,
  {
    ...button("작가의 말", "opens the author's notes", EXACT),
    grows: "the notes, below their heading",
  },
  {
    ...button("Why?", "asks why", EXACT),
    grows: "the answer, in place of Why? and below it",
  },
  {
    ...button(/어땠어요/, "opens the review"),
    grows: "the review, below its heading",
  },
  button(/^재미있었어요/, "says it was fun"),
  button(/^딱 좋아요/, "says the Korean was about right"),
  {
    ...button("Show English", "shows the review's English", EXACT),
    grows: "each question's English, below the toggle",
  },
  {
    ...button("Hide English", "hides it again", EXACT),
    grows: "the review, without its English, below the toggle",
  },
  {
    does: "types what to watch next",
    act: (page) =>
      page.getByRole("textbox", { name: /다음엔 어떤 드라마/ }).fill("복수극"),
  },
]

/** The revealed item's situation `at` (from the end, when negative). */
const situation = (at: number, does: string): Tap => ({
  does,
  act: (page) =>
    page.locator("[data-slot=lens-situation] button").nth(at).click(),
})

/** The grammar lens, from a word set picked from storage. */
const LENS: ReadonlyArray<Tap> = [
  {
    does: "picks a file that is no word set",
    act: (page) =>
      page.getByLabel("Open new words from storage").setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not a word set"),
      }),
  },
  {
    does: "picks the grammar lens's set",
    act: (page) =>
      page.getByLabel("Open new words from storage").setInputFiles(LENS_SET),
    reflows: "screen: the system's picker, and the list back with the set",
  },
  {
    does: "opens the set",
    act: (page) =>
      page
        .getByRole("region", { name: "Ready for you" })
        .getByRole("button")
        .first()
        .click(),
    reflows: "screen: the grammar lens",
  },
  {
    does: "answers items until one's reveal asks for a situation",
    act: async (page): Promise<void> => {
      for (let item = 0; item < 40; item++) {
        if ((await page.locator("[data-slot=lens-situation]").count()) > 0) {
          return
        }
        const fine = page.getByRole("button", { name: "Looks right" })
        const skip = page.getByRole("button", { name: "Skip", exact: true })
        const next = page.getByRole("button", { name: "Next", exact: true })
        if (await fine.isVisible()) await fine.click()
        else if (await skip.isVisible()) await skip.click()
        else if (await next.isVisible()) await next.click()
        // A pick: the first of its candidates, the dock's only grid.
        else await page.locator(".grid button").first().click()
      }
      throw new Error("no item's reveal asked for a situation")
    },
    reflows: "steps: items, each its own layout, up to a reveal",
  },
  situation(0, "picks a situation"),
  situation(-1, "picks another"),
  situation(-1, "takes it back"),
  button("Start talking", "records a take of B", EXACT),
  button("Stop, and keep it", "stops, and keeps it", EXACT),
  button(/^Play the take/, "plays the take"),
  button("Start talking", "records another", EXACT),
  button("Stop, and keep it", "stops, and keeps that too", EXACT),
]

/** The word set read aloud, as the learner picks it from storage. */
const READ_ALOUD_SET = fileURLToPath(
  new URL(
    "../../../../packages/some-content/prompts/read-aloud-generator/sets/level-one.read-aloud.json",
    import.meta.url
  )
)

/** Read aloud's rep card, its steps on a clock between the taps. */
const READ_ALOUD: ReadonlyArray<Tap> = [
  {
    does: "picks the read-aloud set",
    act: (page) =>
      page
        .getByLabel("Open new words from storage")
        .setInputFiles(READ_ALOUD_SET),
    reflows: "screen: the system's picker, and the list back with the set",
  },
  {
    does: "opens the set",
    act: (page) =>
      page
        .getByRole("region", { name: "Ready for you" })
        .getByRole("button")
        .first()
        .click(),
    reflows: "screen: the drill, which starts on opening",
  },
  button("Stuck", "says it is stuck", EXACT),
  button("Pause", "pauses", EXACT),
  button("Resume", "resumes", EXACT),
  button("Skip", "skips to the next", EXACT),
  button("Stuck", "says the next is stuck", EXACT),
  button("Pause", "pauses again", EXACT),
  button("Resume", "resumes again", EXACT),
]

// Each walk on a fresh page.
walkEachPhone("a tap moves nothing it leaves on topik's handheld (HS1)", [
  {
    panel: "topik-handheld",
    taps: [...GENERATE, ...DRAMA],
    label: "topik, write your own and play it",
  },
  { panel: "topik-handheld", taps: LENS, label: "topik, the grammar lens" },
  {
    panel: "topik-handheld",
    taps: READ_ALOUD,
    label: "topik, read aloud",
  },
])
