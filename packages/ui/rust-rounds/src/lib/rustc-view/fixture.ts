/**
 * rustc 1.97.0's real output for two programs that don't compile (RR23,
 * #3243), as home records a run: `--edition 2021`, the program saved as
 * `main.rs`, `--error-format=json`. E0507 is the owner's screenshot's error
 * with its `Clone` note and a suggestion to borrow; E0382 has spans out of
 * line order, a note with two of its own and a suggestion to clone. E0061
 * has an unlabelled primary span and a note pointing into the toolchain's
 * sources; E0433 offers two imports as alternatives at one place.
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
export const E0061_PROGRAM =
  "fn main() {\n    let mut v: Vec<i32> = Vec::new();\n    v.push();\n}\n"

export const E0061: RustcRun & { outcome: "compile-error" } = {
  outcome: "compile-error",
  toolchain: "1.97.0",
  code: "E0061",
  stderr:
    "error[E0061]: this method takes 1 argument but 0 arguments were supplied\n --> main.rs:3:7\n  |\n3 |     v.push();\n  |       ^^^^-- argument #1 of type `i32` is missing\n  |\nnote: method defined here\n --> /rustc/2d8144b7880597b6e6d3dfd63a9a9efae3f533d3/library/alloc/src/vec/mod.rs:1003:11\nhelp: provide the argument\n  |\n3 |     v.push(/* i32 */);\n  |            +++++++++\n\nerror: aborting due to 1 previous error\n\nFor more information about this error, try `rustc --explain E0061`.\n",
  span: { lineStart: 3, columnStart: 7, lineEnd: 3, columnEnd: 11 },
  diagnostics: [
    {
      level: "error",
      code: "E0061",
      message: "this method takes 1 argument but 0 arguments were supplied",
      spans: [
        {
          file: "main.rs",
          lineStart: 3,
          lineEnd: 3,
          columnStart: 11,
          columnEnd: 13,
          isPrimary: false,
          label: "argument #1 of type `i32` is missing",
          suggestedReplacement: null,
        },
        {
          file: "main.rs",
          lineStart: 3,
          lineEnd: 3,
          columnStart: 7,
          columnEnd: 11,
          isPrimary: true,
          label: null,
          suggestedReplacement: null,
        },
      ],
      children: [
        {
          level: "note",
          message: "method defined here",
          spans: [
            {
              file: "/rustc/2d8144b7880597b6e6d3dfd63a9a9efae3f533d3/library/alloc/src/vec/mod.rs",
              lineStart: 1003,
              lineEnd: 1003,
              columnStart: 12,
              columnEnd: 16,
              isPrimary: true,
              label: null,
              suggestedReplacement: null,
            },
          ],
        },
        {
          level: "help",
          message: "provide the argument",
          spans: [
            {
              file: "main.rs",
              lineStart: 3,
              lineEnd: 3,
              columnStart: 11,
              columnEnd: 13,
              isPrimary: true,
              label: null,
              suggestedReplacement: "(/* i32 */)",
            },
          ],
        },
      ],
      rendered:
        "error[E0061]: this method takes 1 argument but 0 arguments were supplied\n --> main.rs:3:7\n  |\n3 |     v.push();\n  |       ^^^^-- argument #1 of type `i32` is missing\n  |\nnote: method defined here\n --> /rustc/2d8144b7880597b6e6d3dfd63a9a9efae3f533d3/library/alloc/src/vec/mod.rs:1003:11\nhelp: provide the argument\n  |\n3 |     v.push(/* i32 */);\n  |            +++++++++\n\n",
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
        "For more information about this error, try `rustc --explain E0061`.",
      spans: [],
      children: [],
      rendered:
        "For more information about this error, try `rustc --explain E0061`.\n",
    },
  ],
}

export const E0433_PROGRAM = "fn main() {\n    let _ = Ordering::Less;\n}\n"

export const E0433: RustcRun & { outcome: "compile-error" } = {
  outcome: "compile-error",
  toolchain: "1.97.0",
  code: "E0433",
  stderr:
    "error[E0433]: cannot find type `Ordering` in this scope\n --> main.rs:2:13\n  |\n2 |     let _ = Ordering::Less;\n  |             ^^^^^^^^ use of undeclared type `Ordering`\n  |\nhelp: consider importing one of these enums\n  |\n1 + use std::cmp::Ordering;\n  |\n1 + use std::sync::atomic::Ordering;\n  |\n\nerror: aborting due to 1 previous error\n\nFor more information about this error, try `rustc --explain E0433`.\n",
  span: { lineStart: 2, columnStart: 13, lineEnd: 2, columnEnd: 21 },
  diagnostics: [
    {
      level: "error",
      code: "E0433",
      message: "cannot find type `Ordering` in this scope",
      spans: [
        {
          file: "main.rs",
          lineStart: 2,
          lineEnd: 2,
          columnStart: 13,
          columnEnd: 21,
          isPrimary: true,
          label: "use of undeclared type `Ordering`",
          suggestedReplacement: null,
        },
      ],
      children: [
        {
          level: "help",
          message: "consider importing one of these enums",
          spans: [
            {
              file: "main.rs",
              lineStart: 1,
              lineEnd: 1,
              columnStart: 1,
              columnEnd: 1,
              isPrimary: true,
              label: null,
              suggestedReplacement: "use std::cmp::Ordering;\n\n",
            },
            {
              file: "main.rs",
              lineStart: 1,
              lineEnd: 1,
              columnStart: 1,
              columnEnd: 1,
              isPrimary: true,
              label: null,
              suggestedReplacement: "use std::sync::atomic::Ordering;\n\n",
            },
          ],
        },
      ],
      rendered:
        "error[E0433]: cannot find type `Ordering` in this scope\n --> main.rs:2:13\n  |\n2 |     let _ = Ordering::Less;\n  |             ^^^^^^^^ use of undeclared type `Ordering`\n  |\nhelp: consider importing one of these enums\n  |\n1 + use std::cmp::Ordering;\n  |\n1 + use std::sync::atomic::Ordering;\n  |\n\n",
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
        "For more information about this error, try `rustc --explain E0433`.",
      spans: [],
      children: [],
      rendered:
        "For more information about this error, try `rustc --explain E0433`.\n",
    },
  ],
}
