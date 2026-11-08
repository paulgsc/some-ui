import someUIEslint, {
  parentRelativeDynamicImportSelectors,
  reactImportBanSelectors,
} from "@some-ui/eslint-kit"

/**
 * The sounds we make ourselves come out as the same bytes on every machine
 * (`src/synth.ts`): only arithmetic IEEE 754 rounds the same everywhere,
 * never an engine's own sine, exponential or power.
 */
const SAME_BYTES = ["src/synth.ts", "src/music-bed.ts"]
const ENGINE_CHOSEN = [
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "sinh",
  "cosh",
  "tanh",
  "exp",
  "expm1",
  "log",
  "log1p",
  "log2",
  "log10",
  "pow",
  "cbrt",
  "hypot",
]

const config = [
  ...someUIEslint,
  {
    files: SAME_BYTES,
    rules: {
      "no-restricted-properties": [
        "error",
        ...ENGINE_CHOSEN.map((property) => ({
          object: "Math",
          property,
          message: "Its last bit is the engine's: use synth.ts's arithmetic.",
        })),
        {
          object: "Math",
          property: "random",
          message: "Not the same twice: use synth.ts's `dice`.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator='**']",
          message: "Its last bit is the engine's: use synth.ts's arithmetic.",
        },
        {
          selector: "MemberExpression[object.name='Math'][computed=true]",
          message: "Name the Math function, so lint can see it.",
        },
        {
          selector:
            "MemberExpression[object.name='globalThis']:matches([property.name='Math'], [property.value='Math'])",
          message: "Name Math itself, so lint can see what is called.",
        },
        // This override replaces the preset's, so its selectors come too.
        ...reactImportBanSelectors,
        ...parentRelativeDynamicImportSelectors,
      ],
    },
  },
]

export default config
