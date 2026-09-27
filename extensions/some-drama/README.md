# some-drama — Drama Overlay

A Firefox (MV2) extension for streaming your reaction to a drama rather than
the drama itself. You watch in one tab; a card on any _other_ page shows how
you are feeling, live, and that page is what OBS captures. Every reaction is
also logged, so the ride through an episode — and a series — is kept.

## Tab roles

Like some-mujik, each tab plays one of two roles — but which sites the drama
plays on is yours to say, not a built-in list:

- **Display** — the default, every tab. Renders the card for the active
  drama; this is the page to capture in OBS. Hotkeys work here too (the
  background asks the source tab for the video time).
- **Source** — a tab on a site you marked as a **streaming site**. The drama
  plays here. No card is drawn; hotkeys log beats with this tab's own video
  time. A beat pressed in a display tab asks every source tab and takes the
  one playing (of two playing, the one started last), so closing or leaving a
  tab needs no handover.

To mark a site, open the drama's tab and press **Mark as streaming** in the
popup; **Unmark** (or ✕ in the popup's _Streaming sites_ list) reverts it.
Open tabs switch roles immediately. Marking covers subdomains (`viki.com`
covers `m.viki.com`). Nothing is marked on a fresh install.

## Beats

A **beat** is one reaction: a mood, how hard it hit (1–3), and where in the
episode it happened.

| Keys                | Command                                    |
| ------------------- | ------------------------------------------ |
| `Alt+Shift+1..6`    | beat: joy, love, sad, tension, cringe, meh |
| `Alt+Shift+=` / `-` | rating up / down half a point (of 10)      |
| `Alt+Shift+]` / `[` | likelihood to finish up / down 10%         |
| `Alt+Shift+D`       | show / hide the card                       |

Press the same mood again within 2 s to escalate that beat (●○○ → ●●○ → ●●●)
instead of logging another. Clicking a mood on the card logs a beat the same
way. The episode comes from the source page's title ("Ep 12", "12화", "第12集")
when it has one, otherwise from the drama's catalog entry.

On the card, the **live strip** above it pulses on every beat — the mood, big
enough to read on stream, and the episode's curve so far (x = time in the
episode, y = mood valence × intensity). Shrunk to its pip, the card keeps only
the latest mood's emoji.

## Verdicts

The **rating** (0–10) and the **likelihood to finish** (0–100%) change as
quickly as a beat: the hotkeys above step them from any tab, and clicking the
card opens a check-in panel with the moods, five stars (2, 4, 6, 8, 10) and
four finish choices (💤 dropping, 🤔 on the fence, 🍿 likely, 🏁 finishing).

Every change is logged for longitudinal tracking (`drama_verdicts`): which
verdict, from what to what, in which episode and at what video time. It is
logged wherever it came from — a hotkey, the card, or a popup edit; a new
drama's first values are logged with no "from". Steps of one verdict within
10 s fold into one change (four presses of `=` are "7 → 9", anchored at the
first press), and stepping back to where it started logs nothing. Removing a
drama keeps its history. On the card, the rating slide draws both verdicts
across the episodes they changed in (rating solid, finish dashed) and names
where the rating started.

## Spotlight and themes

Whatever changed last is the card's face for 4 s: a beat, a rating or a
likelihood to finish takes over the card with its own effect (joy bounces,
love beats, sadness droops, tension shakes, cringe squirms; a verdict rises or
sinks), a burst of petals and a flare in the theme colour, then hands the
face back. A newer change restarts it; an escalated beat plays harder.

The card wears its current mood — the latest beat's, else the entry's — as a
theme: every colour on the card derives from three numbers per mood in
`MOODS` (`logic/content/constants.ts`), and `styles/tokens/theme.css` turns
them into the card's tokens. The petals follow too: the mood picks their
glyphs, motion and tint (sadness falls as rain, joy floats up), and the
rating picks how many there are and how bright.

## Placement

The card mounts in the top-left corner of a tab unless you have dragged it
somewhere; then it mounts where you left it. Either way it is kept wholly on
screen: a position saved in a bigger window is pulled back in, and when the
window shrinks the card moves with it (and returns when the window grows back).

## The popup

A watchlist of up to five dramas; the _active_ one is what beats are logged
against. Each entry has **Facts** (title, episode, network, …; "Extract Tab
Context" pre-fills them from the playing tab) and **Feels** (tags, before →
after, reflection, quote, rating, axes).

## Layout

The tree encodes the Good-Citizen Charter's §2 seam
([`extensions/common/GOOD_CITIZEN.md`](../common/GOOD_CITIZEN.md)):

```
src/
├── background/   storage, message bus, beat log, source-tab election
├── content/      content-script entrypoint — resolves source / display role
├── popup/        popup entrypoint
├── logic/        pure — no document/window/browser/chrome (lint-enforced)
│   ├── beats.ts       logging + escalation, episode curve, episode parsing
│   ├── stream-sites.ts  site matching for the user's streaming sites
│   ├── verdict.ts     rating / likelihood-to-finish ranges and steps
│   ├── verdict-log.ts  verdict history: folding, per-episode trend
│   ├── content/  moods + themes, commands + key bindings, spotlight, petals
│   └── popup/    constants
├── effects/      the only callers of DOM / browser APIs
│   ├── messaging.ts  typed sendMsg, shared by popup and content
│   ├── content/  el(), particles, playback (the source tab's video time)
│   └── popup/    popup FSM, injected tab scraper
├── components/   presentation (vanilla DOM) + Storybook stories
├── types/        message contract, entry and beat shapes — single source
└── styles/       raw CSS partials compiled with UnoCSS
tests/            checks on build output (the content stylesheet)
```

Shared plumbing comes from [`@some-extension/common`](../common/README.md):
the Vite build (`extensionConfig`), the brand icons (`brandIcons: true`), the
keybinding typestate (`attachKeyBindings`), the overlay root, and runtime
guards (`isRecord`).

## Styles

Two stylesheets are generated by UnoCSS during `vite build`:
`dist/styles/content.css` (no preflights — it is injected into every page) and
`dist/popup.css`. What each one scans is declared once in `uno.sources.ts`,
scoped to the modules that render into that surface. Scanning TypeScript
harvests bare words — identifiers, tag names, comments — as utilities, and in
the content sheet those restyle the host page. `tests/content-css.test.ts`
fails when the sheet would contain a utility no class string uses.

## Develop

```bash
pnpm --filter @some-extension/drama build   # → dist/
pnpm --filter @some-extension/drama lint    # eslint + prettier + tsc
pnpm --filter @some-extension/drama test    # vitest
```

Load `dist/manifest.json` from `about:debugging#/runtime/this-firefox` →
**Load Temporary Add-on**. Stories live next to each component and run in the
repo-root Storybook (`STORYBOOK_WORKSPACE=some-drama`).

## Storage (`browser.storage.local`)

| Key                      | Shape                                       |
| ------------------------ | ------------------------------------------- |
| `drama_watchlist`        | `Array<DramaEntry>` (max 5)                 |
| `drama_active_id`        | `string \| null`                            |
| `drama_beats`            | `Array<BeatRecord>` (newest 5000)           |
| `drama_verdicts`         | `Array<VerdictRecord>` (newest 2000)        |
| `drama_stream_sites`     | `Array<string>` — sites marked as streaming |
| `drama_card_position_v3` | `{ x, y, size }` (card layout)              |
| `drama_moments`          | legacy mood log (no video times); not read  |
| `drama_source_tab`       | legacy registered source tab; not read      |

## License

MIT
