---
name: drive-sop
description: Where files go in the owner's Google Drive, and what an agent may do there. Read before any Google Drive connector call that writes, moves or trashes a file, or that looks for something the phone shared (a drama prompt, voice notes, reflections, a study-context export, Build Journal primers or takes, vlog clips, a jobs digest, decisions or scouts). Points at the Drive's own SOP doc, which is the rule.
---

# drive-sop

The owner's Drive (paulgathondudev) has a fixed tree with one rule set per folder, written for
two readers: the owner, saving from the phone's share sheet, and any agent reading or writing
through the Google Drive connector. The rule lives in Drive itself, so a Cowork routine or any
other agent without this repo reads the same text:

- **The SOP:** the Google Doc titled `README — Drive SOP` in My Drive's root. Find it with
  `search_files`, `title = 'README — Drive SOP'`, and read it with `read_file_content`
  before your first write. It wins over this file, a handoff or a memory on where files go.

What it settles, so you know it's worth the read:

- **The tree.** `Inbox/`, `Dramas/requests` and `played`, `Read aloud/sets/<scene>/` and
  `Read aloud/archive/<date>/`, `Study ledger/reflections` and `study-context/<date>/`,
  `Build Journal/`, `Vlog/playoff-delta/week-NN` and `published`, `some-ui jobs/` (`Brief`,
  `Decisions`, `Scout`, `Recommended resume`), `Archive/`, plus the `Publish ledger` sheet. The
  doc carries each folder's id.
- **Who writes what where,** each share's file-name contract, and each folder's lifecycle:
  what moves where and when, and what an agent may trash.
- **Load-bearing names** that code finds by exact title (`Build Journal/voice/primers`,
  `Build Journal/voice/takes`, `some-ui jobs` and its four subfolders). Never rename them.

The phone names each share's folder as its sheet opens, and where a picked file waits (under
"Open a scene from storage"): `apps/www/src/lib/drive-filing`, a sidecar installed in
`main.tsx` that holds the SOP's folders by the share's `dir` (`DRIVE_FOLDERS`) and by the kind
asked about (`DRIVE_LOOK_IN`, through `lookIn("<kind>")`). It is the only code that names Drive
folders, so deleting it and its install removes it whole. Keep the two in step:

- **A share added or renamed** (`shareFiles("<dir>"` in `apps/www`) needs its folder in
  `DRIVE_FOLDERS`, and a `lookIn("<kind>"` its entry in `DRIVE_LOOK_IN`. The module's test
  fails until each has one.
- **A folder moved in the SOP** moves in `DRIVE_FOLDERS` and `DRIVE_LOOK_IN` in the same
  change, and the reverse.

Don't change the tree on your own. A new kind of data gets a section in the SOP doc first,
and only then a folder. That edit is the owner's or the change's author's to make, so name
it in the PR.
