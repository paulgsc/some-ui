# Decay Rings

> The visual grammar for temporal maturity. Derived from
> [`quarantine-capsule.md`](./quarantine-capsule.md) — every rule here cites a
> `QD` or `QM` number, and a rule that cannot is decoration.

## 1. What the grammar has to say

A sealed card must communicate, without language and without leaking anything
(QD1, QD4):

1. how far this artifact is from the present (`QM0`–`QM4`),
2. that the distance, not a judgement about the content, is what is being
   shown (§5),
3. that nothing is being withheld _from_ the user — the artifact is simply not
   yet admissible (QD7).

The third is the one a naive design gets wrong. Locks, countdown timers,
progress bars and "unlock" copy all say _there is a reward behind this and you
are being made to wait_. That is the psychology of the feed reproduced inside
the tool built to escape it.

### The metaphor

Not a nuclear control room. Accurate about danger, but it leaves the user
surrounded by alarm, which is the opposite of living quietly inside a capsule.

Two paired metaphors instead:

- **Recent** — heat, emission, containment.
- **Mature** — sediment, weathering, geological time.

The card does not travel from _bad_ to _good_. It travels from **hot and
inadmissible** to **cool enough to inspect**:

```
energy  →  oxidation  →  sediment  →  archive
```

and never `red alert → amber warning → green success`, which claims something
time cannot establish (§5).

## 2. The two axes must not share a channel

This is the most important structural rule on the page, and the easiest to
violate by accident.

A card has two independent properties:

| axis           | question                                         | states                           |
| -------------- | ------------------------------------------------ | -------------------------------- |
| **Maturity**   | may this artifact enter the airlock?             | `QM0`–`QM4`                      |
| **Disclosure** | how much of it has the user deliberately let in? | masked → meta → title → revealed |

They are orthogonal. A card can be `QM4` and still fully masked; that is the
normal resting state of an admissible card. If maturity and disclosure share a
colour ramp, a rail or a badge, then "old enough to inspect" and "already
inspected" become indistinguishable, and the user loses the one distinction the
whole design exists to make.

**Therefore:**

- **Maturity lives on the perimeter** — card border, a corner medallion, the
  age notation, and the card's overall stillness.
- **Disclosure keeps the interior** — the veil, the meta chip, the title chip,
  the indigo→violet ramp and the progress rail that
  `src/lib/content/veil-styles.ts` already owns.

Maturity describes the card's relationship to the boundary. Disclosure
describes what has crossed it. Do not recolour the existing ladder when a card
matures.

## 3. The medallion

One evolving icon, not five unrelated ones. A row of borrowed symbols — a
trefoil, a clock, an hourglass, an archive box — requires a legend; a single
shape whose geometry changes tells one continuous story: **emission becomes
history**.

```
   QM0            QM1             QM2            QM3           QM4
Unverified      Hot          Cooling      Seasoned     Archival

   ◌?         )))●(((         ( ● )           ◎            ◉
```

### Anatomy

One SVG, five configurations of the same four parts.

- **Core** — a filled circle: the artifact itself. **Constant size in every
  state.** The artifact has not changed; only its relationship to time has.
  Never renders the thumbnail, at any opacity, in any state.
- **Containment ring** — a complete ring around the core. Present whenever age
  is known; **dashed** when it is not (`QM0`).
- **Emission marks** — short outward arcs, always _inside_ the containment
  boundary. Three at `QM1`, one or two at early `QM2`, none from `QM3` on. They
  say _this is emitting, and it is contained_ — not _you are being irradiated
  right now_.
- **Age rings** — concentric rings that accumulate as emissions retract,
  the same open-ended distance-travelled logic at every state: a partial arc
  through `QM2`, two complete rings at `QM3`, three or a faint patina at
  `QM4`. Length reflects the artifact's **estimated age** (from its
  publication date, the same value the maturity class is computed from) —
  never elapsed time since the extension first observed it, which would
  render a newly-encountered archival video as a bare arc instead of the
  fully-ringed `QM4` it already is. It is not scaled to `age / B` and does
  not visually anticipate `B` — a closing arc is the same pending-reward
  shape §6 rejects for text countdowns, whether or not it counts down
  numerically.

A threshold notch at twelve o'clock marks `B`, used only by the one-time
`QM3` crossing animation below. It is not a running progress target: the
`QM2` arc does not fill toward it or otherwise telegraph the boundary in
advance.

### Symbols to avoid, and why

| symbol            | why not                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| Radiation trefoil | Correct semantics, but thirty of them is an emergency dashboard (QD8). |
| Padlock           | Frames the artifact as a reward awaiting unlock (QD7).                 |
| Hourglass         | Implies active waiting and imminent completion (QD7).                  |
| Clock             | Reads as schedule and time-of-day, not as aging.                       |
| Shield + check    | Claims security certification. Time certifies nothing (§5).            |
| Green check       | Same, louder.                                                          |
| Flame             | Trending iconography. Actively inverts the meaning.                    |

## 4. The five states

Palettes are given as sRGB triplets in the form
`src/styles/content.css` already uses for its tokens (`--boyo-ink: 232 234 240`),
so they drop straight into the `:root` block; see §9.

### `QM0` — Unverified

Age could not be established (QD3). Common, expected, and **not an error**.

- **Icon** `╌ ● ╌` — core inside a dashed containment ring. A question mark, if
  used at all, is a small cutout and never the dominant form; the broken ring
  already says "missing evidence" and says it more calmly.
- **Palette** charcoal and cool grey, no warm accent, no apparent depth behind
  the veil: surface `17 19 24`, ring `105 112 125`, text `163 169 179`,
  core `52 57 67`.
- **Motion** none. Explicitly **no spinner** — a spinner promises resolution and
  invites waiting.
- **Copy** `Age unverified` / `Held outside the capsule`. No "Try again."

### `QM1` — Hot

Coupled to the present. No disclosure path exists (QD2).

- **Icon** `)))●(((` — solid core, three contained emissions.
- **Palette** deep **ember**, not emergency red: surface `21 15 13`,
  containment `92 48 33`, emission `216 116 66`, core `240 154 91`,
  label `228 179 154`. Red implies an actionable error; ember implies residual
  heat, and heat is a thing that diminishes on its own.
- **Motion** off by default. If enabled: a containment breath — inner ring
  ±1–2px, opacity 55%→70%, 5–8s, paused off-screen, no glow past the card
  edge. Never a notification pulse.
- **Card** fully opaque. Note that the veil's default glass
  (`bg-[rgb(var(--boyo-glass)/86%)]` plus backdrop blur) is tuned for a card
  the user _may_ open; a `QM1` card should read as wall, not as window.
  No hint pill, no rail, nothing shaped like a call to action.

```
╭────────────────────────────────────────╮
│  HOT                          11 days  │
│                                        │
│               )))●(((                  │
│                                        │
╰────────────────────────────────────────╯
```

### `QM2` — Cooling

In quarantine; distance accumulating.

- **Icon** `( ● )` — emissions reduced, one accumulating age arc, sized from
  the artifact's estimated age (see the anatomy note above — never from time
  since the extension observed it), the same accumulation as `QM3`/`QM4`'s
  rings — never scaled or capped against `B`, so it has no "full" state to
  read as a completion.
- **Palette** ember oxidising into bronze — early `168 92 53`, middle
  `146 112 68`, late `124 119 82`, surface `19 20 17`, text `195 185 150`.
  Saturation falls with age: **time removes visual energy.**
- **Motion** none. A static arc, updated when the day count changes.
- **Card** still sealed. May carry more nonsemantic quarantine information than
  `QM1`. A ring, never a horizontal progress bar — a bar implies a 0–100%
  completion baked into its shape; a ring, drawn open-ended per the anatomy
  note above, reads as accumulating aging rather than approaching a finish.

### `QM3` — Seasoned

Boundary satisfied. **This is the state that unlocks the existing ladder** — and
the only thing that changes is eligibility. The interior renders exactly as it
does today.

- **Icon** `◎` — no emissions; two complete, slightly irregular rings. Tree
  rings, sediment layers, a wax seal. Not a checkmark.
- **Palette** desaturated lichen — surface `16 20 17`, ring `113 133 109`,
  core `145 165 138`, text `187 200 183`. The first natural colour in the
  system, and the shift from ember to lichen carries the whole story without a
  word of copy.
- **Motion** none, permanently. Stillness _is_ the signal: motion belongs to
  the present.
- **Threshold crossing** — if a card matures while the page is open, one
  restrained, one-time transition: the final arc closes, the warm accent
  drains to lichen, emissions retract inward. 600–1000ms, then permanent
  stillness. No bounce, no flash. Maturity arrives quietly.

```
┌─ lichen perimeter ────────────────────┐
│ ◎ SEASONED                    2.4 y   │
│                                       │
│           Inspect metadata            │  ← existing disclosure interior
│                                       │
└───────────────────────────────────────┘
```

### `QM4` — Archival

Substantially detached from the present. The quietest object in the system.

- **Icon** `◉` — a third ring, or a patina on the outer one. Same grammar; do
  not swap in an archive-box glyph.
- **Palette** cool mineral, returning toward the extension's indigo family
  without reusing the disclosure violet: surface `16 18 22`,
  rings `115 128 154`, core `144 157 183`, text `190 199 215`.
- **Motion** none, and less hover response than `QM3` — a mild increase in line
  contrast at most. No lift, no scale, no glow, and never a thumbnail bleeding
  through the veil.

## 5. What the grammar must never claim

`QM3` and `QM4` mean the quarantine condition is satisfied. Not safe, not
accurate, not wholesome, not worth watching. Every avoided symbol in §3 is
avoided for this reason, and the legend below stops short of the word "safe"
on purpose:

```
)))●(((   HOT         Coupled to the present; held outside
  ( ● )   COOLING     Accumulating temporal distance
    ◎     SEASONED    Eligible for deliberate inspection
    ◉     ARCHIVAL    Substantially detached from the present
   ◌?     UNVERIFIED  Age could not be established; held
```

## 6. Copy

The visuals do most of the work; the few words must not undo it.

**Use:** unverified · hot · cooling · seasoned · archival · quarantine ·
matures · admission · inspect metadata · inspect title · temporal boundary ·
held outside.

**Never:** safe · approved · clean · verified · good · recommended · unlock ·
reward · trending · fresh · new · ready to watch.

_Fresh_ and _new_ are the sharpest of these. Mainstream interfaces present
recency as a benefit; here it is the hazard, and the vocabulary must not carry
the opposite valence in from outside.

Prefer **"matures"** to **"unlocks"** as the verb for the threshold crossing
itself (the one-time `QM3` transition copy in §4) — unlocking frames the card
as a reward box; maturing treats time as a neutral transformation already
underway. This is a word choice for describing the transition, not a licence
to pair either verb with a live decreasing count: see "No countdown" below.

### No countdown, in any state, by default

`quarantine-capsule.md` QD7 is unconditional: nothing may count down toward a
payoff, in any state. A per-card `matures in 102` is exactly that regardless
of which band frames it — the number decreases every day toward the same
admission event, which is the pending-reward shape QD7 forbids. Relabeling it
as "a statement about the card" does not change what it does: it still counts
down.

**Default, in every state:** age only, framed as distance already travelled,
never as distance remaining:

```
QM1   HOT · 11 days
QM2   COOLING · 263 days
QM3   SEASONED · 2.4 years
```

A countdown-inside-`QM2` default was proposed in an earlier draft of this
document and is rejected outright, not deferred behind a judgement call — it
cannot be reconciled with QD7's unconditional wording. If a forward-looking
figure at the boundary is ever wanted, it needs its own explicit QD7
amendment first; it is not a default this document gets to introduce.

### Age notation

Age is nonsemantic (H2) and central to the policy, so it is shown plainly
rather than hidden in a tooltip. Compact and exact: `3 h` · `11 d` · `8 mo` ·
`2.4 y` · `7 y`. Derived from a day count and never from the extracted string
(QD4).

## 7. Feed-level sealing

Per-card medallions are right when the user is examining the airlock. They are
wrong as the ordinary landscape of the capsule (QD8) — a beautifully designed
visualisation of thirty things being withheld is still thirty things on screen.

Where a recommendation region contains **nothing admissible**, seal the region
instead of the cards:

```
╭────────────────────────────────────────╮
│  32 CONTAINED · 27 AGE-KNOWN · 5 UNVERIFIED │
│                                        │
│  Youngest 2 h · oldest 4 mo (known ages only) │
│  None meet your 1-year boundary        │
╰────────────────────────────────────────╯
```

An all-held region can contain `QM0` cards alongside `QM1`/`QM2`, and `QM0`
has no established age at all (`QD3`). The aggregate must say so rather than
folding unknown evidence into a recency claim: count unverified entries
separately, and scope any youngest/oldest range to cards with a known age —
never silently drop the unverified count to make the range look complete.

Counts and age ranges are nonsemantic and may be shown. An `Examine containers`
control may expand the region into individual cards, but it is never the
visually primary element, and expanding does not confer eligibility — each
card keeps whatever held class it already had (`QM0`, `QM1`, or `QM2`; a
sealed region is not exclusively `QM1`), rendered in its own held
presentation.

Where a region is mixed, show the admissible cards and collapse the remainder
into one trailing summary rather than interleaving sealed and open cards, which
reproduces the field of mystery boxes at lower density.

A surface header gives the temporal weather at a glance, using the same
medallions at small size:

```
HOME TRANSMISSIONS
──────────────────────────────────
24 held · 7 cooling · 3 seasoned
Boundary: 1 year
```

Atmosphere stays restrained: a one- or two-pixel rule in the dominant band's
colour, never a page-wide wash. The watch-page sidebar is the surface where
this matters most — it is where an admitted archival video is surrounded by the
present.

### The design test

Render two pages side by side: **(A)** thirty individually medallioned `QM1`
cards; **(B)** one panel reading _30 current transmissions contained; none meet
your one-year boundary_. Whichever feels more like living inside the capsule is
the default. The expectation is B, decisively, and if it is not then QD8 is
weaker than stated and should be amended.

## 8. Motion and accessibility

> Radioactivity is expressed through energy; maturity is expressed through its
> absence.

This is the rare case where less animation is not merely accessibility
hygiene — it is the semantic endpoint. **Ongoing, at-rest motion** is only
ever available to `QM1` (the containment breath), is off by default, and no
state has looping motion at rest from `QM3` on. The one exception is the
`QM3` **threshold-crossing transition** (§4): a one-time reaction to a state
_change_, not a resting animation, that plays once and ends in permanent
stillness — it does not contradict "removed entirely at `QM3`" because it
belongs to the instant of arrival, not to being there. `prefers-reduced-motion`
must still shorten or skip it, the same as any other transition.

The existing reduced-motion contract in `src/styles/content.css` targets
`[class*="boyo-"]` wholesale — but `animation` and `transition` are not
inherited properties, so that selector only silences an element that itself
carries a `boyo-*` class. **Every node the medallion animates directly — an
inner ring or path driving the containment breath or threshold settle, not
only the outer wrapper — must carry its own `boyo-*`-prefixed class**, or the
existing contract does not reach it and the animation keeps running under
`prefers-reduced-motion: reduce`. Two further additions it does **not**
cover:

- **Colour is not the only channel.** Each class differs in geometry
  (dashed / emissions / arc / rings) as well as in hue, so the ramp survives
  monochrome and every common colour-vision deficiency. Ember-vs-lichen in
  particular must not be the sole carrier.
- **The medallion needs a text equivalent.** The veil element is a plain
  `div`, whose implicit `generic` role does not reliably expose an
  `aria-label` to assistive tech — the label needs a nameable role to attach
  to. Give the veil `role="img"` (it is a single glyph conveying one piece of
  state, the same contract as an `<img alt>`) carrying the class name and age
  (`"Hot, 11 days"`) — the same information a sighted user gets from the
  perimeter, and no more. It must not carry the title.

## 9. Where this lands in the code

Recorded so the implementing patch does not have to rediscover the workspace's
constraints.

- **Tokens** go in the `:root` block of `src/styles/content.css`, in the same
  `R G B` triplet form as `--boyo-ink` and friends. Five surfaces, five rings,
  five inks — name them `--boyo-m0-*` … `--boyo-m4-*` so the band is legible in
  the class strings.
- **Every class string** goes in `src/lib/content/veil-styles.ts` and nowhere
  else. `uno.config.ts` scans exactly that file and `content.css`; a class
  authored anywhere else is not generated and silently does nothing.
- **Keyframes** (the containment breath, the threshold settle) are `@`-rules
  and therefore belong in `content.css` beside `boyo-rise` / `boyo-thaw`, and
  are referenced from the utilities by name.
- **The medallion SVG** is built by `dom-handle.ts`, which owns DOM
  construction; `veil-styles.ts` names its classes and authors none of its
  structure.
- **The projection** — which class, which age string, which copy — is decided
  in `fsm.ts:project()` and handed to the DOM layer as data, the way
  `HintModel` and `RailStep` already are. Two consequences worth stating: the
  presentation layer receives a class and a day count and never the extracted
  date string (QD4), and adding a maturity variant without updating `project()`
  becomes a compile error rather than a card that paints nothing.
- **Container queries.** The veil is a `@container/boyo`, and the medallion is
  subject to the same three-tier scale as everything else: it must survive a
  ~170px slider tile. Smallest-first — at base, the medallion alone with no
  label; the class name and age appear at `@[220px]`.
