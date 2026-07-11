import { extensionsRecommended } from "maishatu-eslint-kit"

const transportConfig = [
  ...extensionsRecommended,
  {
    // contracts/ is Theorem D.2's zero-business-logic anchor: type
    // declarations only, with no dependency on any other transport stage.
    // A change that requires this rule to be relaxed is, by Corollary D.2.1,
    // evidence a domain concern (or a stage implementation) leaked into the
    // one directory the whole package's build-independence claim rests on.
    files: ["src/contracts/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/bootstrap/*",
                "**/session/*",
                "**/sensor/*",
                "**/estimator/*",
                "**/adapter/*",
                "**/scheduler/*",
                "**/actuator/*",
                "**/lifecycle/*",
              ],
              message:
                "contracts/ must not import any other transport stage (canon Theorem D.2 / Corollary D.2.1).",
            },
          ],
        },
      ],
    },
  },
  {
    // Bootstrap runs before Session, Sensor, Estimator, Adapter, Scheduler,
    // Actuator, or Lifecycle exist (Definition D.2) — none of hat(H), Phi,
    // or Delta have been constructed yet, so none of those stages can be a
    // dependency of bootstrap/ without contradicting the definition itself.
    files: ["src/bootstrap/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/session/*",
                "**/sensor/*",
                "**/estimator/*",
                "**/adapter/*",
                "**/scheduler/*",
                "**/actuator/*",
                "**/lifecycle/*",
              ],
              message:
                "bootstrap/ runs before any other transport stage exists and must not import one (canon Definition D.2).",
            },
          ],
        },
      ],
    },
  },
]

export default transportConfig
