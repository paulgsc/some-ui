/**
 * The sample week: Quillmoss, week 46 of 2026 (RR11, paulgsc/some-ui#2686).
 * It is the prototype's week (https://claude.ai/artifact/BZXfi4qUWggZ5BLr4xbaWs),
 * its programs reflowed to fit the phone's 40 columns. Quillmoss is invented.
 *
 * Every `expect` was checked with rustc 1.97.0 (2d8144b78 2026-07-07),
 * `--edition 2024 -C opt-level=0`, home's recording profile:
 *
 * - QM-311 compiles and prints `7 ok\n8 late\n`. It misses the SLA only by
 *   the scenario's own figures; nothing measured them.
 * - QM-312 fails with two `E0502`s, at 7:9 (`buf.clear()`) and 8:9
 *   (`buf.push_str(line)`), each against the borrow at 9:18.
 * - QM-313 fails with `E0597` at 8:9: `thread::spawn` needs `buf` borrowed
 *   for `'static`. The same body under `thread::scope` (spawning with
 *   `s.spawn` and joining inside the scope) compiles and prints `2 rows`.
 *
 * Tests and the viewer's sample week (RR21) read it.
 */
import type { Week } from "@rust-rounds/lib/formats/week"
import { WEEK_SCHEMA } from "@rust-rounds/lib/formats/week"

/** A program from its lines, each ending in `\n`. */
const program = (...lines: Array<string>): string => `${lines.join("\n")}\n`

export const QUILLMOSS_WEEK: Week = {
  schema: WEEK_SCHEMA,
  id: "2026-w46",
  by: "claude-routine",
  family: "performance-task",
  opens: "2026-11-09T00:00:00-08:00",
  due: "2026-11-15T23:59:00-08:00",
  company: {
    name: "Quillmoss",
    about:
      "Sensor telemetry for cold storage: freezers report temperature and door events, about 40,000 a second at peak.",
  },
  role: "An engineer on Quillmoss's ingestion team.",
  audience: "The ingestion team, and the operators who watch the freezers.",
  story:
    "As an operator, I need every batch of sensor events parsed and handed to the writer within 2 ms, so an alarm fires before a freezer warms.",
  sla: [
    {
      what: "Parse one 1,000-event batch and hand it to the writer",
      target: "2 ms, p99",
    },
    { what: "Peak load", target: "40,000 events a second" },
  ],
  tickets: [
    {
      id: "QM-311",
      title: "Parse the batch without a copy per field",
      spec: "The ingest worker calls `fields` on every event, and at peak the batch misses its 2 ms p99. rustc has nothing to say about this code.",
      figures: [
        "At peak, a 1,000-event batch takes 3.1 ms at p99, against the 2 ms SLA.",
      ],
      speakTo: [
        "Where the time goes, though rustc is silent",
        "What change removes it",
        "What that asks of the caller",
      ],
      program: program(
        "fn fields(line: &str) -> Vec<String> {",
        "    line.split(',')",
        "        .map(|f| f.trim().to_string())",
        "        .collect()",
        "}",
        "",
        "fn main() {",
        "    let input =",
        '        ["7,ok,12.5", "8,late,40.1"];',
        "    for line in input {",
        "        let f = fields(line);",
        '        println!("{} {}", f[0], f[1]);',
        "    }",
        "}"
      ),
      expect: { outcome: "prints", stdout: "7 ok\n8 late\n" },
      concepts: [
        {
          id: "allocation-on-the-hot-path",
          name: "Allocation on the hot path",
        },
        { id: "lifetime-elision", name: "Lifetime elision" },
      ],
    },
    {
      id: "QM-312",
      title: "Reuse the read buffer without losing the fields",
      spec: "To stop copying, a teammate reuses one read buffer and keeps borrowed fields in the batch. rustc refuses it.",
      figures: [],
      speakTo: [
        "What rustc is protecting",
        "Two ways out",
        "What each costs against 2 ms",
      ],
      program: program(
        "fn main() {",
        "    let input =",
        '        ["7,ok,12.5", "8,late,40.1"];',
        "    let mut buf = String::new();",
        "    let mut batch = Vec::new();",
        "    for line in input {",
        "        buf.clear();",
        "        buf.push_str(line);",
        "        let id = buf.split(',').next();",
        "        batch.push(id.unwrap());",
        "    }",
        '    println!("{}", batch.len());',
        "}"
      ),
      expect: { outcome: "compile-error", code: "E0502" },
      concepts: [
        {
          id: "borrows-into-a-reused-buffer",
          name: "Borrows into a reused buffer",
        },
      ],
    },
    {
      id: "QM-313",
      title: "Hand the batch to the writer thread",
      spec: "The batch goes to a writer thread so parsing never waits on disk. With `thread::spawn` it doesn't compile; with `thread::scope` the same body does.",
      figures: [],
      speakTo: [
        "Why spawn refuses and scope accepts",
        "Which you'd ship here, and why",
      ],
      program: program(
        "use std::thread;",
        "",
        "fn main() {",
        "    let buf = String::from(",
        String.raw`        "7,ok,12.5\n8,late,40.1",`,
        "    );",
        "    let batch: Vec<&str> =",
        "        buf.lines().collect();",
        "    let writer = thread::spawn(move || {",
        "        let n = batch.len();",
        '        println!("{n} rows");',
        "    });",
        "    writer.join().unwrap();",
        "}"
      ),
      expect: { outcome: "compile-error", code: "E0597" },
      concepts: [{ id: "static-and-threads", name: "'static and threads" }],
    },
  ],
  references: ["rust-reference", "ownership-inventory"],
  rubric: "solo",
}
