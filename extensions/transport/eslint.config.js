import { extensionsRecommended } from "@some-ui/eslint-kit"

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
  {
    // Session (S3) is purely epoch/lifetime bookkeeping (Definition 5.4,
    // Definition D.1) consumed by the Sensor, Estimator, and Actuator — not
    // the other way around. A dependency in the reverse direction would
    // make Session's reset semantics contingent on the very stages it is
    // meant to be a stable substrate for.
    files: ["src/session/**/*.ts"],
    ignores: ["src/session/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/sensor/*", "**/estimator/*", "**/actuator/*"],
              message:
                "session/ is estimator-agnostic bookkeeping (canon Definition 5.4) and must not import sensor/, estimator/, or actuator/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Sensor (S4, S5) only produces tokens (Definition 3.2) and reconciles
    // identity (Definition 4.1) — it has no business folding evidence
    // (Estimator), deciding (Adapter), scheduling (Scheduler), writing to
    // G_t (Actuator), or tearing anything down (Lifecycle).
    files: ["src/sensor/**/*.ts"],
    ignores: ["src/sensor/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/estimator/*",
                "**/adapter/*",
                "**/scheduler/*",
                "**/actuator/*",
                "**/lifecycle/*",
              ],
              message:
                "sensor/ only produces tokens and reconciles identity (canon §3–§4) and must not import estimator/, adapter/, scheduler/, actuator/, or lifecycle/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Estimator (S6) folds evidence into a hypothesis (Definition 5.3) and
    // has no knowledge of *why* a key is being tracked (S6 non-goal): no
    // invariant evaluation (Adapter), scheduling policy, DOM writes
    // (Actuator), or teardown wiring belong here.
    files: ["src/estimator/**/*.ts"],
    ignores: ["src/estimator/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/adapter/*",
                "**/scheduler/*",
                "**/actuator/*",
                "**/lifecycle/*",
              ],
              message:
                "estimator/ folds evidence into a hypothesis (canon Definition 5.3) and must not import adapter/, scheduler/, actuator/, or lifecycle/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Scheduler (S8) decides only *when* to ask the Adapter, never *what*
    // (S8 acceptance criterion) — it has no need to import any other
    // transport stage; it is driven entirely by its own `trigger()`/
    // `onFire` callback surface.
    files: ["src/scheduler/**/*.ts"],
    ignores: ["src/scheduler/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/sensor/*",
                "**/estimator/*",
                "**/adapter/*",
                "**/actuator/*",
                "**/lifecycle/*",
              ],
              message:
                "scheduler/ decides only when, never what (canon §8) and must not import sensor/, estimator/, adapter/, actuator/, or lifecycle/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Actuator (S9) only realizes a given Fin(A) (§8's (ACT) rule) — it
    // has no business deciding *what* to apply (that's the Adapter, S7
    // non-goal), scheduling itself, or reaching into the Sensor/Estimator.
    files: ["src/actuator/**/*.ts"],
    ignores: ["src/actuator/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/sensor/*",
                "**/estimator/*",
                "**/adapter/*",
                "**/scheduler/*",
                "**/lifecycle/*",
              ],
              message:
                "actuator/ only realizes a given Fin(A) (canon §8) and must not import sensor/, estimator/, adapter/, scheduler/, or lifecycle/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Lifecycle (S10) only sequences disposal and Session's reset
    // (Theorem D.1) against a caller-supplied registry of disposables —
    // it has no need to import Sensor/Estimator/Adapter/Scheduler/
    // Actuator directly, only Session and (via a callback, not an import)
    // Bootstrap's teardown.
    files: ["src/lifecycle/**/*.ts"],
    ignores: ["src/lifecycle/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/sensor/*",
                "**/estimator/*",
                "**/adapter/*",
                "**/scheduler/*",
                "**/actuator/*",
              ],
              message:
                "lifecycle/ only sequences disposal and Session's reset (canon Theorem D.1) and must not import sensor/, estimator/, adapter/, scheduler/, or actuator/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Corollary D.2.1 (the litmus test): no module outside adapter/'s own
    // package — or this package's own tests, which are allowed to wire a
    // concrete adapter for exercising the pipeline — may import a concrete
    // adapter implementation. Everything else depends on the `Adapter` type
    // from contracts/adapter.ts and receives an implementation only via
    // injection (Axiom D.1).
    files: ["src/**/*.ts"],
    ignores: ["src/adapter/**", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/adapter/null-adapter", "**/adapter/null-adapter.*"],
              message:
                "Only adapter/invoke.ts and this package's own tests may reference a concrete adapter implementation (canon Corollary D.2.1). Depend on the Adapter type from contracts/adapter.ts instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // adapter/ ships raw TS source with no build step of its own -
    // package.json "exports" point "./*" straight at src/*.ts, unlike a
    // vite-built package where an internal alias gets resolved away before
    // the dist ships. filter-classifier imports src/adapter/swatches/index.ts
    // directly through that source export for its own typecheck/bundling, so
    // a self-alias here would need every such consumer's config to know
    // about it too. Every other stage directory already replaces this rule
    // with its own D.2/D.2.1 boundary patterns above, which is why only
    // adapter/ needs this explicit carve-out.
    files: ["src/adapter/**/*.{ts,tsx,cts,mts}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // Every stage block above scopes its own no-restricted-imports override
    // to non-test files (`ignores: ["**/*.test.ts", ...]` or an equivalent
    // files glob) - the D.2/D.2.1 boundary invariants are about production
    // wiring, not test fixtures. That leaves *.test.ts falling through to
    // base.config's blanket "../*" ban with no stage-specific replacement,
    // even though a test importing its own stage's siblings by relative
    // path is exactly the "same local module neighborhood" case the rule
    // means to allow.
    files: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]

export default transportConfig
