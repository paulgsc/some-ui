/**
 * rustc 1.97.0's real output for two programs that don't compile (RR23,
 * #3243), as home records a run: `--edition 2021`, the program saved as
 * `main.rs`, `--error-format=json`. E0507 is the owner's screenshot's error
 * with its `Clone` note and a suggestion to borrow; E0382 has spans out of
 * line order, a note with two of its own and a suggestion to clone. Each
 * diagnostic's `rendered` joins to `stderr`.
 */
import type { RustcRun } from "@rust-rounds/lib/formats"

export const E0507_PROGRAM =
  '#[derive(Debug)]\nstruct Ride { name: String, minutes: u32 }\n\nfn main() {\n    let open = vec![\n        Ride { name: String::from("Loop"), minutes: 12 },\n        Ride { name: String::from("Drop"), minutes: 4 },\n    ];\n    let last = open[open.len() - 1];\n    println!("{} waits {}", last.name, last.minutes);\n}\n'

export const E0507: RustcRun & { outcome: "compile-error" } = {
  outcome: "compile-error",
  toolchain: "1.97.0",
  code: "E0507",
  stderr:
    "error[E0507]: cannot move out of index of `Vec<Ride>`\n --> main.rs:9:16\n  |\n9 |     let last = open[open.len() - 1];\n  |                ^^^^^^^^^^^^^^^^^^^^ move occurs because value has type `Ride`, which does not implement the `Copy` trait\n  |\nnote: if `Ride` implemented `Clone`, you could clone the value\n --> main.rs:2:1\n  |\n2 | struct Ride { name: String, minutes: u32 }\n  | ^^^^^^^^^^^ consider implementing `Clone` for this type\n...\n9 |     let last = open[open.len() - 1];\n  |                -------------------- you could clone this value\nhelp: consider borrowing here\n  |\n9 |     let last = &open[open.len() - 1];\n  |                +\n\nerror: aborting due to 1 previous error\n\nFor more information about this error, try `rustc --explain E0507`.\n",
  span: { lineStart: 9, columnStart: 16, lineEnd: 9, columnEnd: 36 },
  diagnostics: [
    {
      level: "error",
      code: "E0507",
      message: "cannot move out of index of `Vec<Ride>`",
      spans: [
        {
          file: "main.rs",
          lineStart: 9,
          lineEnd: 9,
          columnStart: 16,
          columnEnd: 36,
          isPrimary: true,
          label:
            "move occurs because value has type `Ride`, which does not implement the `Copy` trait",
          suggestedReplacement: null,
        },
      ],
      children: [
        {
          level: "note",
          message: "if `Ride` implemented `Clone`, you could clone the value",
          spans: [
            {
              file: "main.rs",
              lineStart: 2,
              lineEnd: 2,
              columnStart: 1,
              columnEnd: 12,
              isPrimary: true,
              label: "consider implementing `Clone` for this type",
              suggestedReplacement: null,
            },
            {
              file: "main.rs",
              lineStart: 9,
              lineEnd: 9,
              columnStart: 16,
              columnEnd: 36,
              isPrimary: false,
              label: "you could clone this value",
              suggestedReplacement: null,
            },
          ],
        },
        {
          level: "help",
          message: "consider borrowing here",
          spans: [
            {
              file: "main.rs",
              lineStart: 9,
              lineEnd: 9,
              columnStart: 16,
              columnEnd: 16,
              isPrimary: true,
              label: null,
              suggestedReplacement: "&",
            },
          ],
        },
      ],
      rendered:
        "error[E0507]: cannot move out of index of `Vec<Ride>`\n --> main.rs:9:16\n  |\n9 |     let last = open[open.len() - 1];\n  |                ^^^^^^^^^^^^^^^^^^^^ move occurs because value has type `Ride`, which does not implement the `Copy` trait\n  |\nnote: if `Ride` implemented `Clone`, you could clone the value\n --> main.rs:2:1\n  |\n2 | struct Ride { name: String, minutes: u32 }\n  | ^^^^^^^^^^^ consider implementing `Clone` for this type\n...\n9 |     let last = open[open.len() - 1];\n  |                -------------------- you could clone this value\nhelp: consider borrowing here\n  |\n9 |     let last = &open[open.len() - 1];\n  |                +\n\n",
    },
    {
      level: "error",
      code: null,
      message: "aborting due to 1 previous error",
      spans: [],
      children: [],
      rendered: "error: aborting due to 1 previous error\n\n",
    },
    {
      level: "failure-note",
      code: null,
      message:
        "For more information about this error, try `rustc --explain E0507`.",
      spans: [],
      children: [],
      rendered:
        "For more information about this error, try `rustc --explain E0507`.\n",
    },
  ],
}

export const E0382_PROGRAM =
  'fn total(names: Vec<String>) -> usize {\n    names.len()\n}\n\nfn main() {\n    let names = vec![String::from("Loop"), String::from("Drop")];\n    let count = total(names);\n    println!("{count} rides: {:?}", names);\n}\n'

export const E0382: RustcRun & { outcome: "compile-error" } = {
  outcome: "compile-error",
  toolchain: "1.97.0",
  code: "E0382",
  stderr:
    'error[E0382]: borrow of moved value: `names`\n --> main.rs:8:37\n  |\n6 |     let names = vec![String::from("Loop"), String::from("Drop")];\n  |         ----- move occurs because `names` has type `Vec<String>`, which does not implement the `Copy` trait\n7 |     let count = total(names);\n  |                       ----- value moved here\n8 |     println!("{count} rides: {:?}", names);\n  |                                     ^^^^^ value borrowed here after move\n  |\nnote: consider changing this parameter type in function `total` to borrow instead if owning the value isn\'t necessary\n --> main.rs:1:17\n  |\n1 | fn total(names: Vec<String>) -> usize {\n  |    -----        ^^^^^^^^^^^ this parameter takes ownership of the value\n  |    |\n  |    in this function\nhelp: consider cloning the value if the performance cost is acceptable\n  |\n7 |     let count = total(names.clone());\n  |                            ++++++++\n\nerror: aborting due to 1 previous error\n\nFor more information about this error, try `rustc --explain E0382`.\n',
  span: { lineStart: 8, columnStart: 37, lineEnd: 8, columnEnd: 42 },
  diagnostics: [
    {
      level: "error",
      code: "E0382",
      message: "borrow of moved value: `names`",
      spans: [
        {
          file: "main.rs",
          lineStart: 7,
          lineEnd: 7,
          columnStart: 23,
          columnEnd: 28,
          isPrimary: false,
          label: "value moved here",
          suggestedReplacement: null,
        },
        {
          file: "main.rs",
          lineStart: 8,
          lineEnd: 8,
          columnStart: 37,
          columnEnd: 42,
          isPrimary: true,
          label: "value borrowed here after move",
          suggestedReplacement: null,
        },
        {
          file: "main.rs",
          lineStart: 6,
          lineEnd: 6,
          columnStart: 9,
          columnEnd: 14,
          isPrimary: false,
          label:
            "move occurs because `names` has type `Vec<String>`, which does not implement the `Copy` trait",
          suggestedReplacement: null,
        },
      ],
      children: [
        {
          level: "note",
          message:
            "consider changing this parameter type in function `total` to borrow instead if owning the value isn't necessary",
          spans: [
            {
              file: "main.rs",
              lineStart: 1,
              lineEnd: 1,
              columnStart: 17,
              columnEnd: 28,
              isPrimary: true,
              label: "this parameter takes ownership of the value",
              suggestedReplacement: null,
            },
            {
              file: "main.rs",
              lineStart: 1,
              lineEnd: 1,
              columnStart: 4,
              columnEnd: 9,
              isPrimary: false,
              label: "in this function",
              suggestedReplacement: null,
            },
          ],
        },
        {
          level: "help",
          message:
            "consider cloning the value if the performance cost is acceptable",
          spans: [
            {
              file: "main.rs",
              lineStart: 7,
              lineEnd: 7,
              columnStart: 28,
              columnEnd: 28,
              isPrimary: true,
              label: null,
              suggestedReplacement: ".clone()",
            },
          ],
        },
      ],
      rendered:
        'error[E0382]: borrow of moved value: `names`\n --> main.rs:8:37\n  |\n6 |     let names = vec![String::from("Loop"), String::from("Drop")];\n  |         ----- move occurs because `names` has type `Vec<String>`, which does not implement the `Copy` trait\n7 |     let count = total(names);\n  |                       ----- value moved here\n8 |     println!("{count} rides: {:?}", names);\n  |                                     ^^^^^ value borrowed here after move\n  |\nnote: consider changing this parameter type in function `total` to borrow instead if owning the value isn\'t necessary\n --> main.rs:1:17\n  |\n1 | fn total(names: Vec<String>) -> usize {\n  |    -----        ^^^^^^^^^^^ this parameter takes ownership of the value\n  |    |\n  |    in this function\nhelp: consider cloning the value if the performance cost is acceptable\n  |\n7 |     let count = total(names.clone());\n  |                            ++++++++\n\n',
    },
    {
      level: "error",
      code: null,
      message: "aborting due to 1 previous error",
      spans: [],
      children: [],
      rendered: "error: aborting due to 1 previous error\n\n",
    },
    {
      level: "failure-note",
      code: null,
      message:
        "For more information about this error, try `rustc --explain E0382`.",
      spans: [],
      children: [],
      rendered:
        "For more information about this error, try `rustc --explain E0382`.\n",
    },
  ],
}
