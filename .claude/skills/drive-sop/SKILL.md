---
name: drive-sop
description: Where files go in the owner's Google Drive, and what an agent may do there. Read before any Google Drive connector call that writes, moves or trashes a file, or that looks for something in Drive (Build Journal primers or takes, a study-context export, LeetType sessions, a copy of a jobs digest, word set or drama, vlog clips, or an old reflection, drama prompt, decisions or scouts file shared there before it went home). Points at the Drive's own SOP doc, which is the rule.
---

# drive-sop

The owner's Drive (paulgathondudev) has a fixed tree with one rule set per folder, written for
two readers: the owner, saving from the phone's share sheet, and any agent reading or writing
through the Google Drive connector. The rule lives in Drive itself, so a Cowork routine or any
other agent without this repo reads the same text:

- **The SOP:** the Google Doc titled `README — Drive SOP` in My Drive's root. Find it with
  `search_files`, `title = 'README — Drive SOP'`, and read it with `read_file_content`
  before your first write. It wins over this file, a handoff or a memory on where files go.

## What Drive is for now

Home is the owner's record (the owner's decision D1 on #2174): reflections, drama prompts,
Jobs decisions and scouts, every voice note, and the scenes, dramas and digests the routines
write all go home, and the routines read them from the Jobs mailbox. Drive is a third party,
kept only for what the mailbox can't carry or the phone can't reach:

- **Build Journal audio** (`Build Journal/voice/primers`, `voice/takes`, `ideas`): the phone
  shares takes and ideas there for the `build-journal` skill's cloud splicer. The mailbox
  refuses audio by design.
- **The study-context export** (`Study ledger/study-context/<date>/`): a hand-off to the
  owner's own agent. No routine reads it.
- **LeetType** (`LeetType/`): the session files the phone picks back, and the weekly review
  routine's folders (`packages/ui/leetype/REVIEW-ROUTINE.md`).
- **Copies for refreshing away from home** (D4, #2183): the phone can't reach home there, so
  it picks from Drive. The Jobs run copies each digest to `some-ui jobs/Brief`, and the
  reflections run copies each scene to a folder of `Read aloud/sets` and each drama to
  `Dramas/requests`, each only after home has it. A routine reads a copy back only where
  home's has been archived out of the mailbox's live files.
- **What only Drive holds, read and never rewritten:** reflections and drama prompts shared
  to `Study ledger/reflections` and `Dramas/requests` before the phone sent them home (an APK
  from before HF3 and HF4 still shares them there); scene folders an earlier run wrote,
  whose description (`answers: <base>`, `stock: <base>`) says what they answer; dramas in
  `Dramas/requests` and `Dramas/played`; and `some-ui jobs/Decisions` and `Scout`, which take
  nothing new since HF2, and hold two files home can't take yet (#2393).
- **The rest of the tree:** `Inbox/`, `Vlog/playoff-delta/week-NN` and `published`,
  `some-ui jobs/Recommended resume`, `Archive/`, and the `Publish ledger` sheet. The doc
  carries each folder's id.

No run keeps state in Drive any more: none writes a folder description, and none moves a
drama set to `Dramas/played`. Each routine's `ROUTINE.md` says, under "What still needs
Drive", what it does without the connector and what it can't.

## What the SOP settles

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

Don't change the tree on your own. A new kind of data goes home first; one the mailbox can't
carry gets a section in the SOP doc first, and only then a folder. That edit is the owner's
or the change's author's to make, so name it in the PR.
