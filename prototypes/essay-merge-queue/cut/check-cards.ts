import { readFileSync } from "node:fs"

import { prepare } from "./src/lib/burn-in"

const series = JSON.parse(
  readFileSync(
    "../../video-render/src/sample/series/cheat-sheet/v2.json",
    "utf8"
  )
)
const cut = JSON.parse(readFileSync(process.argv[2]!, "utf8"))
let bad = 0
for (const s of cut.shots)
  for (const b of s.burnIns) {
    const design = series.designs[b.kind]
    if (!design) {
      console.log(s.id, b.kind, "no design in the series (a new member)")
      bad++
      continue
    }
    const r = prepare(
      {
        kind: b.kind,
        design,
        params: {
          ...b.params,
          stamp: { sources: ["paulgsc/some-ui@7a3dc3f"], date: "2026-11-21" },
        },
      },
      { width: 1920, height: 1080 }
    )
    if (!r.ok) {
      bad++
      console.log(s.id, b.kind, r.problems)
    } else console.log(s.id, b.kind, "ok")
  }
process.exitCode = bad ? 1 : 0
