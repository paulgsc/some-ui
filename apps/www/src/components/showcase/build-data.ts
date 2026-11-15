import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { markSvg } from "@some-ui/styles/brand/mark"
import type { Plugin } from "vite"

import { excerpt, verdicts } from "./evidence.ts"
import { WORDS as W } from "./words.ts"

const root = resolve(import.meta.dirname, "../../../../..")
const read = (path: string): string => readFileSync(resolve(root, path), "utf8")

/** The existing composition and motion engine, with a manual seek control. */
function motionPreview(): string {
  const mark = `data:image/svg+xml,${encodeURIComponent(markSvg({ brand: "#f5b75b", ink: "#241a13" }))}`
  const setup = `<script>window.__hyperframes = {getVariables: () => ({part: "open", ground: "#241a13"})}</script>`
  const engine = read("packages/video-motion/compositions/_lib/motion.js")
  const controls = `<style>
    #mark {width: 40vmin; height: 40vmin; margin: -20vmin 0 0 -20vmin}
    footer {position:absolute;bottom:16px;left:20px;right:20px;color:#f4efe6;font:12px monospace}
    input {width:100%;accent-color:#f5b75b} .still {display:none}
    @media (prefers-reduced-motion: reduce) {label {display:none}.still {display:block}}
    </style><footer><label>${W.motionSeek}<input aria-label="${W.motionSeek}" type="range" min="0" max="2" step="0.01" value="0.65"></label><span class="still">${W.motionStill}</span></footer>
    <script>
      const control = document.querySelector('input');
      const seek = time => window.dispatchEvent(new CustomEvent('hf-seek', {detail:{time}}));
      seek(matchMedia('(prefers-reduced-motion: reduce)').matches ? 2 : Number(control.value));
      control.addEventListener('input', () => seek(Number(control.value)));
    </script>`
  return read("packages/video-motion/compositions/brand-v1/index.html")
    .replace('src="mark.svg"', `src="${mark}"`)
    .replace(
      '<script src="lib/motion.js"></script>',
      `${setup}<script>${engine}</script>`
    )
    .replace("</body>", `${controls}</body>`)
}

/** Read only checked-in public sources, at config/build time. No owner store is read. */
export type ShowcaseEvidence = {
  motionHtml: string
  counts: { total: number; holds: number; other: number }
  sampleSaid: string
  policy: string
  decision: string
  gestures: string
  canon: string
}

export function readEvidence(): ShowcaseEvidence {
  const ledger: {
    families: Array<{ objectives: Array<{ verdict: string }> }>
  } = JSON.parse(read("packages/assurance/src/ledger.json"))
  const call: { open: { said: string } } = JSON.parse(
    read("packages/video-render/src/templates/conference-call/sample-week.json")
  )
  const decision: { id: string; made: string; by: string; chose: string } =
    JSON.parse(read("docs/calls/C378.json"))
  return {
    motionHtml: motionPreview(),
    counts: verdicts(ledger.families),
    sampleSaid: call.open.said,
    policy: excerpt(
      read("CLAUDE.md"),
      "- **Claim** —",
      "at most files the invariant names."
    ),
    decision: JSON.stringify(
      {
        id: decision.id,
        made: decision.made,
        by: decision.by,
        chose: decision.chose,
      },
      null,
      2
    ),
    gestures: excerpt(
      read("packages/eslint/src/gestures.ts"),
      "const GESTURE_MODULES",
      "])"
    ),
    canon: excerpt(
      read("docs/canon/adaptive-learning-canon.typ"),
      '#definition("2.1", name: "Latent learner state")[',
      "(fatigue, engagement, input fluency) that modulate responses without being\n  about any particular concept.\n]"
    ),
  }
}

/** Ships the snapshot, never the source documents or the Node reader. */
export function showcaseEvidencePlugin(): Plugin {
  const id = "virtual:showcase-evidence"
  return {
    name: "showcase-evidence",
    resolveId(source): string | undefined {
      return source === id ? `\0${id}` : undefined
    },
    load(source): string | undefined {
      return source === `\0${id}`
        ? `export const EVIDENCE = ${JSON.stringify(readEvidence())}`
        : undefined
    },
  }
}
