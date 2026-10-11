/**
 * A minimal synthetic tree (docs/makjang/README.md, "Increments", M1): a
 * root, one split, and a leaf at `MAX_DEPTH`. Its names are placeholders, not
 * a scene: nothing here is a curated drama, and nothing in makjang reads them.
 *
 *   root (choice c-root: a, b, c)
 *   ├─ a → s-a, a leaf at depth 1
 *   ├─ b → s-b (choice c-b: x, y)
 *   │      ├─ x → s-bx, a leaf at depth 2
 *   │      └─ y → s-by, a leaf at depth 2
 *   └─ c → s-c, a leaf at depth 1
 *
 * `check` is a string: makjang carries it without reading it.
 */

const leaf = (id: string, beats = 1): Record<string, unknown> => ({
  id,
  place: `place of ${id}`,
  feeling: `feeling of ${id}`,
  beats: Array.from({ length: beats }, (_, index) => ({
    id: `${id}-n${index + 1}`,
    text: `text ${id} ${index + 1}`,
    gloss: `gloss ${id} ${index + 1}`,
  })),
})

/** A fresh copy each call, so a test may mutate it. */
export function rawTree(): Record<string, unknown> {
  return {
    id: "lesson-1",
    level: 2,
    pov: "p1",
    cast: [
      {
        id: "p1",
        name: "One",
        standing: "the one the learner follows",
        registers: { p2: "polite" },
      },
      {
        id: "p2",
        name: "Two",
        standing: "one's elder",
        registers: { p1: "plain" },
        voice: "low",
        gender: "male",
        figure: "elder",
      },
    ],
    root: {
      id: "s-root",
      place: "place of s-root",
      feeling: "feeling of s-root",
      beats: [
        { id: "s-root-n1", text: "text r1", gloss: "gloss r1" },
        {
          id: "s-root-l1",
          speaker: "p2",
          text: "text r2",
          gloss: "gloss r2",
          direction: "quietly",
        },
        { id: "s-root-l2", speaker: "p1", text: "text r3", gloss: "gloss r3" },
      ],
      choice: {
        id: "c-root",
        prompt: "prompt c-root",
        check: "check c-root",
        options: [
          { id: "a", child: leaf("s-a", 2) },
          {
            id: "b",
            art: "art b",
            child: {
              ...leaf("s-b", 2),
              choice: {
                id: "c-b",
                prompt: "prompt c-b",
                check: "check c-b",
                options: [
                  { id: "x", child: leaf("s-bx") },
                  { id: "y", child: leaf("s-by", 3) },
                ],
              },
            },
          },
          { id: "c", child: leaf("s-c") },
        ],
      },
    },
  }
}
