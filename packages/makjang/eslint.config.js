import someUIEslint, { parentRelativeImportPattern } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...someUIEslint,

  // MK1 (docs/makjang/README.md, "Invariants"): the engine imports no media
  // and no topik. The package boundary keeps topik out of makjang as a whole
  // (no dependencies; src/__tests__/package-shape.test.ts); this keeps
  // everything but the schema out of the engine, so a media port type added
  // to this package later still cannot reach it. Flat config replaces this
  // rule's options wholesale, so base.config.ts's `../` ban is restated.
  {
    files: ["src/engine.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            {
              regex: "^(?!@makjang/schema$)",
              message:
                "The engine imports only makjang's schema: no media, no topik, no other module (MK1, docs/makjang/README.md).",
            },
          ],
        },
      ],
    },
  },
])
