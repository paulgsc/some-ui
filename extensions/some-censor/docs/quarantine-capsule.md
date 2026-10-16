# The Quarantine Capsule

> The user story `some-censor` is built for. Read this before changing what the
> extension _does_; read
> [`docs/canon/dom-state-estimation-canon.typ`](../../../docs/canon/dom-state-estimation-canon.typ)
> before changing how it _observes_.

## 0. Why this document exists

This workspace has a rigorous theory of the page and no written theory of the
person using it. The canon says exactly how much may be believed about a vendor
DOM that never settles. Nothing says what the masking is _for_ — so the only
recoverable statement of intent is the manifest's one-line description,
"progressive content masking with intentional disclosure," which describes a
mechanism and not a goal.

That asymmetry is load-bearing, not cosmetic. Every product question the
extension has been unable to answer — should the reveal ladder be shorter,
should there be a dismiss action, should whitelisting be per-channel, should
the bulk-advance shortcut exist — is a question about the goal, and the
workspace has been answering them from the mechanism. This document fixes the
goal so those questions have somewhere to resolve.

### Why this is not a canon

`docs/canon/README.md` reserves `.typ` canons for formal theories that source
is _derived_ from and that a falsifying observation revises. The capsule
doctrine is not that. It is a statement of one person's values about their own
attention; no observation of YouTube can refute it, and it governs exactly one
workspace. Filing it as a canon would dilute what "canon" means here.

It is nevertheless **governing**: sections below carry hand-assigned numbers
(`QD1`–`QD17`, `QM0`–`QM4`, `QA1`–`QA5`) for the same reason the canons do, so
source comments and commit messages can cite them and the citations survive
reshuffles. The `Q` prefix is deliberate: the Actuator and Sensor cite the
veil's own unrelated `D1`–`D6` (restated in `actuator/actuator.ts`), and Core
the card pipeline's `M1`–`M3` and `M6` (restated in `core/reduce.ts`) — a bare
"see D3" or "M2" would resolve to whichever ledger the reader happened to be
looking at. A behavioural change to this extension that
contradicts a `QD` number is a proposal to amend this document — make the
amendment in the same change or say the doctrine is missing a result.

## 1. The person

One user. This is not a market; it is a tool built by its only known user, and
the absence of comparable products in the wild is evidence about the demand
curve, not about the idea.

That user wants to **live under a rock**. Not "use YouTube more
intentionally" — that is a different product, with different mechanics
(session goals, relevance judgements, watch queues, weekly reports), and
building it would be a category error. The goal is informational isolation
with continued access to the library:

> YouTube is connected to a cultural present I regard as hazardous. I want its
> archive. I do not consent to contact with its present merely because I opened
> it.

## 2. The hazard model

The hazard is **contact with the current-events graph**, in any form:
news, gossip, controversy, sport, the discourse of the moment, and — this is
the part that makes the problem hard — the endless supply of ordinary content
that has been retitled, rethumbnailed, or reframed to attach itself to the
discourse of the moment. Across every category, recommendations collapse into
variations of _the sky is falling, because of \<current event\>_.

Three properties of the hazard drive everything below.

**H1 — Every surface of a card is a carrier.** The thumbnail is the worst,
because it is involuntary. But the title is a carrier, the channel's current
branding is a carrier, and a description snippet is a carrier. There is no
"safe preview" that consists of showing less of the same semantic payload.

**H2 — The hazard is time-local.** The current-events graph is, definitionally,
about now. This is the one exploitable structural property: a video's _age_
correlates strongly with its distance from the discourse, and age is
**nonsemantic** — it can be read, computed on, and displayed without any of the
card's meaning crossing the boundary (under `QD14` it is never displayed). Age is not a classifier of content. It is
a classifier of _coupling to the present_, which is the actual threat.

**H3 — Judgement does not scale, and exercising it is itself a cost.** A
hermit does not want to be excellent at evaluating each fresh transmission. The
point of the capsule is to not have to.

## 3. The story

**Primary.**

> As someone who wants to remain culturally and informationally isolated from
> the present, I want YouTube to behave like an archive rather than a live
> feed, so that I can consume video without involuntary contact with current
> events, controversy, or their semantic traces.

The operative phrase is _archive rather than live feed_. The extension today
makes the live feed safe to approach. It does not yet make YouTube feel like an
archive.

**Supporting.**

- **Inspect without contact.** I can learn a card's source, length and age
  without seeing its thumbnail or its title. _Superseded by `QD12`, `QD14` and
  `QD16`:_ there is no inspection step. An admitted card shows its title,
  source and length on a plate; a held card shows nothing; no card shows an
  age.
- **Let time do the filtering.** Material coupled to the present is
  categorically ineligible for disclosure, not merely expensive to disclose. I
  do not have to decide; it is not yet admissible.
- **Fail closed on ignorance.** When the extension cannot establish a card's
  age, the card stays sealed. Unknown is never treated as old.
- **Live in an interior.** I can consume admitted material without standing in
  front of the external feed to do it. _Superseded by `QD11`:_ once held
  material is absent rather than covered, youtube.com itself is the interior.
- **End with nothing having entered.** A session in which I revealed nothing
  is a _successful_ session, and the interface should not read as a failure
  state.

## 4. The doctrine

Seventeen results. Each carries where it stands against the current
implementation, because a doctrine whose status is undocumented becomes
folklore within a release. `QD11`–`QD17` were added on 2026-10-16 (epic
#1799). Where earlier results say a card is _sealed_ or _held_, under `QD11`
it is absent.

---

### QD1 — Semantic non-contact

No thumbnail, title, description, comment, transcript or autoplay preview
belonging to an unadmitted artifact may become legible without an explicit
disclosure act by the user.

_Status: holds._ This is the invariant the pre-mask occluder in
`src/styles/content.css` and the veil in `src/lib/content/actuator/veil.ts`
already enforce, and it is the one thing in the workspace that must never be
traded for comfort. Everything below is built **above** this line, never by
weakening it.

---

### QD2 — The present is outside, by default

Recency is independently hazardous. Material newer than the configured
**temporal boundary** is ineligible for semantic disclosure regardless of its
source, its subject, or how much the user wants to see it in the moment.

This is the doctrine's central claim and the one that distinguishes the capsule
from the friction mechanism the extension is today. Friction says _you may
expose yourself, after several deliberate actions_. Quarantine says _this is
not eligible yet_. The difference is whether curiosity has a path.

_Status: absent._ Today every card, of every age, has a path to `revealed` in
three interactions.

_Amended by `QD15`:_ "regardless of its subject" admits one exception. Music
whose title is mostly in a script the owner listens to but doesn't read is
admitted whole at any age, because its coupling to the present, the quantity
this result bounds by age, is already zero.

---

### QD3 — Unknown means outside

Missing or unparseable age never implies maturity. A card whose age cannot be
established is held, indefinitely, in the same posture as a card known to be
new.

This is the canon's fail-closed posture (`dom-state-estimation-canon.typ`, the
impossibility results in §2) applied to a product decision rather than a
rendering decision, and it matters more here than there: the failure mode of a
wrong render is an ugly card, and the failure mode of a wrong maturity estimate
is exposure.

Concretely, and this is not hypothetical — see §7 — the current
`uploadDate` field is a raw DOM string produced by two different extraction
paths, one of which returns _the last metadata run of a row_, which is a date
only when the card happens to have one. Any age estimator built on it will
receive view counts, live badges, premiere notices, membership strings and
empty values, in several languages. All of those are `Unverified`, and
`Unverified` is sealed.

_Status: absent._ No estimator exists; `uploadDate` is never parsed. #1384.

_Amended by `QD15`:_ opacity admits without age evidence, so a lane video is
shown whole even when its age is unknown. Everywhere else, unknown still means
outside.

---

### QD4 — Age is nonsemantic; the raw string is not

Derived age — a number of days, and the maturity class computed from it — may
be displayed on a sealed card. **The extracted `uploadDate` string may never
be.**

The distinction is sharp and worth the extra step. "8 months" is a scalar.
`"LIVE"`, `"Premieres Tomorrow"`, `"Streamed 2 days ago"` are the discourse of
the moment announcing itself in the one field the extension had decided was
safe to echo. The presentation layer receives a class and a day count; it never
receives the string they were derived from.

_Status: violated, already._ `appendMetaChip()` in
`src/lib/content/actuator/veil.ts` builds `[duration, uploadDate].filter(Boolean).join(" · ")` into the
metadata sub-line, and it runs on the very first disclosure step (the `"meta"`
case, before `"title"`) — not only after a bulk advance. The raw extracted
string, including whatever the extraction fallback returns for a live badge,
a premiere notice, or an unparsed locale, is already reaching the DOM today.
This is not a future risk to guard against; it is the workspace's current
behavior, and the gap table in §7 lists it accordingly.

_Amended by `QD14`:_ the permission above to display a derived age is
withdrawn. No age, raw or derived, is displayed on any surface. The raw-string
prohibition stands unchanged.

---

### QD5 — Time outranks provenance

Trusting a source is not the same as admitting its output. A creator whose
back catalogue is timeless is not thereby licensed to deliver today's
controversy; a channel that has been safe for two years is one upload away from
being the vector.

The temporal boundary therefore applies **through** the whitelist. Channel
trust may make a card's identity certain, or shorten its boundary, but it does
not exempt a card from having one.

_Amended by `QD16`:_ there is no channel trust at all. The whitelist is deleted
(#1807), and every source has the same boundary.

_Status: violated._ `applyWhitelist` in `src/lib/content/fsm.ts` accepts any
state and yields `Whitelisted`, which is a permanent bypass, and the
`CHANNEL_WHITELISTED` broadcast lifts every card from that channel at once —
including the one uploaded this morning. The prompt's copy, "always show
content from this channel," is an accurate description of the current
behaviour and precisely the semantics QD5 rejects. See `QA2`.

---

### QD6 — Bulk operations inherit the boundary

Any affordance that acts on many cards at once acts only on cards that are
individually admissible. There is no operation whose plural form discloses
something its singular form would refuse.

_Status: violated._ `advance-all-to-title` (Ctrl/⌘+Shift+Period, wired in
`src/lib/content/commands.ts`) advances **every** tracked card to `title`. Under
QD2 that is a whole-page capsule breach bound to a single keystroke. Note also
what its existence says diagnostically: the per-card ritual became mechanical
enough that the user wanted to batch past it — which is an argument for
_fewer eligible cards_, not for a faster ladder.

---

### QD7 — Non-exposure is a complete outcome

A session in which nothing was revealed is a success and must read as one. The
interface may not present sealed material as a pending task, a backlog, or a
reward awaiting unlock. Nothing counts down toward a payoff.

This is why [`absent-plated-heard.md`](./absent-plated-heard.md) forbids the
padlock, the progress bar, the green check and every count, and why a held card
is absent rather than drawn at all (`QD11`).

_Status: violated._ The ladder's hints and progress rail present every veiled
card as a pending step. #1803.

---

### QD8 — Distance, not only safety

Safety is _I cannot accidentally see the current thing_. Distance is _I do not
feel surrounded by the current thing_. The extension supplies the first and not
the second: a home feed of thirty individually veiled cards is thirty sealed
mystery boxes, each an actionable object, each an invitation. That is a bunker
whose walls are covered in windows.

Where a region contains nothing admissible, the region — not each card in it —
is the unit of concealment. One quiet statement and reclaimed empty space is
the correct rendering of "there is nothing here for you today."

_Status: absent._ The veil is applied per renderer; there is no surface-level
construct at all.

_Superseded in part by `QD11`._ The distance this result asks for stands. Its
rendering does not: "one quiet statement" is withdrawn, because any statement
about held material keeps the present in the room. A region with nothing
admissible renders nothing.

---

### QD9 — The capsule needs an interior

A boundary alone leaves the user standing outside their own tool. There must be
somewhere to be that is not the external feed: material already admitted,
deliberately imported, or sufficiently aged, consumable without transiting the
recommendation surface.

_Status: absent, and deliberately last among the original nine._ QD9 is the
largest of them and the one most likely to grow a second product inside this
one. It is recorded so the story is complete, and explicitly deferred behind
QD2/QD3 — the boundary is worth building before the room behind it.

_Superseded by `QD11`._ The owner chose youtube.com itself over a second
surface ("it's always youtube.com"). With held material absent and admitted
material plated, the page is the interior; no reading room is built.

---

### QD10 — The metadata boundary

A deliberate metadata disclosure — the existing `Inspect metadata` step in the
ladder — is available only to an artifact that is already eligible (`QM3` or
`QM4`). It carries the duration and derived age the story already promises
(§3, "Inspect without contact") and `QD4` already permits.

A source identity is different, and this document does not license it
unconditionally. `H1` names a channel's **current** branding as a carrier in
its own right — a channel renamed or re-branded around a current event is
exactly that carrier, and stripping its avatar, banner, and subscriber count
does not launder a name that is itself current-events content. Showing a
channel's display name is safe only if it can be shown to have been stable
across the temporal boundary; no such staleness check exists in this
workspace today. Until one does, a source identity is held under `QD1` like
the rest of the card — `QD10` does not create a metadata-only exception for
it. Beyond duration and age, this step may reveal nothing further — never a
thumbnail, title, description fragment, or unverified source identity.

A held card (`QM0`–`QM2`) exposes neither source nor branding at any
disclosure step. `QD1`'s non-contact bar has no metadata-only exception for
held material; this result only says what becomes available once an artifact
has already cleared the boundary.

_Status: absent._ No admission axis exists yet to gate `Inspect metadata` by
eligibility (see the gap table in §7); the ladder currently starts
unconditionally at `meta` for every card, which is the same root cause as
`QD4`'s violation above.

_Superseded by `QD12` and `QD16`._ There is no metadata step: an admitted card
shows its title, channel name and duration on a plate, with no disclosure act.
The risk this result named is recorded rather than resolved. A channel's
current display name is a carrier (`H1`); the owner accepted showing it as
text on admitted cards (2026-10-16), and its visual branding, the avatar, is
plated.

---

### QD11 — Absent

A held card is not on the page. It leaves layout and the accessibility tree;
nothing stands in its place, and nothing counts, summarizes or mentions it. A
card is held when it is `QM0`–`QM2`, live, a premiere or a Short, unless
`QD15` admits it. Nothing navigates to a held video on the owner's behalf:
autoplay stops before one. Supersedes `QD8`'s quiet statement, `QD9`, and the
interior bullet in §3.

The owner's test, after living with the extension: what made a session bad was
having _seen_ things. A covered card is still something seen — a shape, a
slot, an invitation — and a count of covered cards is the present reported
second-hand.

_Status: absent._ Every held card is veiled in place today. #1803.

---

### QD12 — The plate

A card admitted by distance has its thumbnail replaced by a plate drawn only
from the video id and the duration, and its channel image by a disc drawn from the channel id.
The card shows its title, channel name and duration, and nothing else
(`QD14`).

A thumbnail packs the most context into the fewest pixels: a face, a caption in
huge type, an arrow, the week's news. The owner already chooses from words, so
the thumbnail has no job left. The plate is the card's finished state, not a
cover waiting to be lifted.

_Status: absent._ #1804.

---

### QD13 — The face is a deliberate act

A plated video's real thumbnail is shown only on its own watch page, after a
continuous 3-second hold on a control that offers it, for that view only. It is
never offered on a feed, never remembered, and never rewarded.

This is friction in the opposite place from the old ladder. The ladder put work
between the owner and the _video_, so every bad card cost effort. The hold puts
work only between the owner and the _thumbnail_, which nothing needs.

_Status: absent._ #1805.

---

### QD14 — No crowd, no age

Nothing that reports on other people — a count of views, likes, subscribers,
comments or live viewers, a trending rank, the most-replayed graph, a status
badge such as the verified tick, or the comments themselves — and no age, raw
or derived, is shown on any surface, in any state, the lane included. Amends
`QD4`.

Each of these reports on a culture outside the rock. None informs a choice the
owner makes.

_Status: absent._ #1802.

---

### QD15 — Opacity is a second way in

Music whose title is mostly in a script the owner has declared they listen to
but don't read is admitted whole, whatever its age, unless it is live, a
premiere or a Short. The script is counted, never interpreted (§8). The owner
sets this per language, so marking Chinese admits Han-script titles, which
includes Japanese titles written mostly in kanji; that overlap is accepted.

`H2` makes age a classifier of _coupling to the present_. Music whose words do
not reach the listener has no coupling to measure: the owner consumes K-drama
and C-drama soundtracks "as an artifact". This is not a bypass of `QD2`; it is
the same quantity measured a second way, and it amends `QD2`'s "regardless of
its subject" and `QD3`'s "unknown means outside" to say so. Lane videos keep
their real thumbnails; `QD12` applies only to videos admitted by distance. The rule describes the owner as they
are, and does not anticipate them learning these scripts.

_Status: absent._ #1806.

---

### QD16 — Decide once

The owner's judgement is exercised on two settings — the boundary `B`, and the
scripts they listen to but don't read — and nowhere else, besides switching
the extension on or off. No card, channel or page offers a disclosure step, a
trust decision or a verdict. The one exception is `QD13`'s face control, which
shows only the thumbnail of a video already admitted and plated, and decides
nothing about admission.

`H3` already said judgement does not scale; the ladder contradicted it, and
the owner confirmed it from use: deciding card by card was "a chore", and "not
rewarding … if you don't like the card that you did all that work for".
Amends `QD5`; supersedes `QD10`, `QA2`, `QA3`, §6's delayed subscription and
the "airlock" in §7.

_Status: absent._ The ladder is live. #1803, #1807.

---

### QD17 — Quiet

The extension adds no copy, clock or count to youtube.com, with two
exceptions. A held watch page reads "Not here." with a Back button and a tab
title that is not the video's. A plated video's watch page carries the face
control (`QD13`), labelled with what it does and nothing more.

A tool that narrates itself ("in here it is 2025", "24 held") makes its
mechanism the thing on screen; the owner found that inauthentic.

_Status: violated._ The ladder's hints ("Click to preview", "Double-click to
reveal") are on-page copy. #1803.

## 5. The temporal model

### One preference, four derived bands

The user configures **one** number: the **temporal boundary** `B` — the age at
which an artifact is admitted by distance. Every
band is derived from `B`, so the model reads the same whether `B` is ninety
days or five years, and there is no configuration surface with five
independently wrong thresholds on it.

This is a statement of the _model_, not a claim that a production path to
store `B` exists today. It does not (#1807 builds one): `#1386` (`QC4`) established that
`browser.storage.local` holds only `apiBaseUrl`, that every settings row sits
behind an `ApiClient` no shipping build can reach, and that
`_assertDev()` throws on `import.meta.env.PROD`. Whether `B` persists and
propagates in production is `QC4`'s question to answer, not this document's
to promise.

| id    | class          | range               | meaning                                                    |
| ----- | -------------- | ------------------- | ---------------------------------------------------------- |
| `QM0` | **Unverified** | age unknown         | Maturity cannot be established. Sealed indefinitely (QD3). |
| `QM1` | **Hot**        | `age < 0.1 · B`     | Coupled to the present. Categorically ineligible.          |
| `QM2` | **Cooling**    | `0.1 · B ≤ age < B` | In quarantine. Temporal distance accumulating.             |
| `QM3` | **Seasoned**   | `B ≤ age < 3 · B`   | Boundary satisfied. Eligible for staged inspection.        |
| `QM4` | **Archival**   | `age ≥ 3 · B`       | Substantially detached from the present.                   |

The bands remain the estimator's vocabulary, but none is drawn. On the page,
`QM0`–`QM2` are absent (`QD11`), and `QM3`–`QM4` are plated (`QD12`), unless
the card is live, a premiere or a Short (absent) or in the lane (whole,
`QD15`). "Staged inspection" in the `QM3` row is superseded by `QD16`.

Suggested initial `B`: **1 year**. It is large enough that the discourse a
video was attached to has been replaced, and small enough that the archive
remains large.

**Future-dated cards are `QM1`, not `QM0`.** A premiere or scheduled stream has a
negative age; it is the most present-coupled object on the page, and routing it
to "unknown" would be technically defensible and practically backwards.

### What maturity is not

`QM3`/`QM4` mean **the quarantine condition is satisfied**. They do not mean
safe, accurate, wholesome, non-clickbait, or worth watching. Time has performed
the only decontamination it is capable of: it has weakened the artifact's
coupling to the present. The visual grammar is built around never overclaiming
this — no checkmarks, no green, no "approved."

### Maturity is an estimate, and belongs where estimates belong

Age is not observed; it is estimated from a vendor-authored string that YouTube
localizes, reformats, and sometimes omits. That places it squarely inside the
canon's observe/estimate/plan/act factorization rather than beside it: the
extract layer observes, a pure classifier estimates, and the estimate carries
its own bottom element (`QM0`) so that "no estimate" is representable rather
than approximated by a wrong one. `Unverified` is not an error state. It is a
valid and common result, and the interface must not render it as a failure:
under `QD11` it renders nothing at all.

## 6. Admission — the two axes

Maturity is one axis. **Admission** is the other, and conflating them is the
mistake the current whitelist makes.

| id    | primitive              | meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QA1` | **Artifact clearance** | This one video's `QM3`/`QM4` status is not re-litigated by an ordinary re-estimate — age only grows under §7's stable-identity/evidence/clock preconditions, so a valid estimate never reclassifies downward on its own. `QA1` grants no protection beyond that: if §7's fail-closed rule fires (identity, evidence, or clock invalidated), the artifact reverts to `QM0` like any other invalidated estimate, and `QA1` cannot keep a `QM1`/`QM2` artifact disclosable — see below. |
| `QA2` | **Identity trust**     | This channel is genuinely who it claims to be. Provenance, not admission. _Superseded by `QD16`:_ no trust decision exists.                                                                                                                                                                                                                                                                                                                                                          |
| `QA3` | **Delayed source**     | This channel's uploads become admissible after `B` (or a per-source `B`) — never before it. _Superseded by `QD16`:_ there are no per-source settings; not planned.                                                                                                                                                                                                                                                                                                                   |
| `QA4` | **Boundary exemption** | **Rejected.** Listed only to be ruled out: a channel's uploads skipping the boundary entirely is exactly what `QD2` forbids, however it is framed at the UI.                                                                                                                                                                                                                                                                                                                         |
| `QA5` | **Opacity**            | Music whose title is mostly in a script the owner listens to but doesn't read is admitted whole, at any age, unless live, a premiere or a Short (`QD15`). Unlike `QA4` it is not keyed on a source: it measures the same coupling `B` does, by another route.                                                                                                                                                                                                                        |

`QD2` says material newer than the boundary is ineligible "regardless of its
source, its subject, or how much the user wants to see it in the moment." That
sentence resolves the admission/exemption question completely, in one
direction: `QA4` is rejected outright, not merely deprioritized behind `QA3`,
and `QA1` survives only in the constrained reading above — a guarantee
against needlessly re-litigating a still-valid estimate for an artifact
that is _already_ eligible, never an override of §7's fail-closed rule and
never a path that admits one that isn't. (This also matches `#1382`'s own
non-goals: boundary exemption is explicitly out of the implementation
floor.)

Today's whitelist is `QA4` wearing `QA2`'s label, and under this resolution it
has no home in the doctrine at all — it is not a stricter `QA3`, it is the
primitive this section rejects. The replacement aligned with the story is
`QA3`: a **delayed subscription**, where following a creator means receiving
their work a year late. That is what living under a rock actually looks like,
and it is a considerably more pleasant thing to be offered than a permanent
trust decision made in a right-click menu.

_Superseded by `QD16`._ The owner chose no per-source decisions at all: the
whitelist is deleted and no delayed subscription is built. `QA5` is the one
admission primitive added since, and it is keyed on a title's script, not on a
source.

## 7. Where the implementation stands

An honest map, so the next patch has somewhere to attach. Nothing in this
section is a behavioural change; it is a statement of distance.

### What already supports the story

- **The airlock is right.** Metadata before title, title before card, thumbnail
  never previewed, is exactly correct under H1 — the ladder was never the
  problem. Under QD2 it survives unchanged; it simply becomes reachable only by
  `QM3`/`QM4` cards. _Superseded by `QD16`:_ the ladder was the problem after
  all, as a cost rather than a leak (`H3`). It is deleted; admitted cards are
  plated with no disclosure act.
- **The occluder is right.** The static pre-mask, and the rule that handover
  swaps one occluder for another rather than passing through a legible state,
  is the foundation QD1 names. Do not touch it. Under `QD11` it still guards
  every card until the card is classified; what changes is only what follows
  handover: absence, a plate, or (in the lane) the card whole, not a veil.
- **Age is already a first-class field.** The upload date is extracted
  alongside channel and duration, so admission is computable when a card is
  first resolved, before anything is shown.
- **Reading is not disclosing.** `extractMeta` is a pure DOM read
  (`src/lib/content/extract/meta.ts`); calling it at resolve time to compute
  maturity discloses nothing. This is what makes a maturity gate cheap: no new
  observation is required, only an earlier one.

### What contradicts it

| gap                                            | where                                                    | doctrine   |
| ---------------------------------------------- | -------------------------------------------------------- | ---------- |
| Every card, at every age, can reach `revealed` | `fsm.ts` — the `ViewState` union has no maturity axis    | QD2        |
| `uploadDate` is an unparsed raw string         | `extract/meta.ts`                                        | QD3        |
| Raw `uploadDate` already reaches the DOM       | `actuator/veil.ts` (`appendMetaChip`)                    | QD4        |
| Whitelist is a permanent, channel-wide bypass  | `fsm.ts:applyWhitelist`, `CHANNEL_WHITELISTED` broadcast | QD5, QA2   |
| Bulk advance ignores eligibility               | `commands.ts` → Core's `advance-all-to-title` command    | QD6        |
| No surface-level concealment                   | veil is per-renderer throughout                          | QD8        |
| Manifest copy describes the mechanism          | `public/manifest.json` `description`                     | §0         |
| Held cards are veiled in place, not absent     | `actuator/veil.ts` (the veil after handover)             | QD11       |
| Admitted cards would show real thumbnails      | nothing replaces a thumbnail or avatar                   | QD12       |
| No crowd number or age is removed              | vendor metadata rows render untouched                    | QD14       |
| The ladder and its hints are on the page       | `fsm.ts:project()`, `actuator/gestures.ts`               | QD16, QD17 |

### Extraction hazards a maturity estimator will meet

Catalogued here rather than discovered later. Each must resolve to `QM0` unless
it can be parsed with certainty.

- `lockupUploadDate` returns the **last text run** of a lockup's second
  metadata row. On a card that carries `"1.2M views · 3 days ago"` that is the
  age; on a card with no date row it is the view count; on a Short it is
  frequently neither.
- Relative dates are **localized**. An estimator keyed on English fails open on
  every other locale unless the default branch is `QM0`.
- Live, premiere and "Streamed …" cards carry badges in the date position.
  Negative or absent age → `QM1` (future-dated) or `QM0` (unreadable), never a
  small positive number.
- Playlist rows and many Shorts lockups carry **no date at all**. Under QD3
  those surfaces are permanently sealed. This is the correct outcome and should
  be documented as such rather than fixed — a surface that cannot prove its age
  does not get the benefit of the doubt.
- A parsed date is often an **interval, not a point**: `"2 weeks ago"` names a
  bucket, not a day count, and treating its midpoint as exact can promote a
  card near either boundary prematurely. QD3's fail-closed direction extends
  to imprecision the same way it applies to absence: classify from the
  **youngest (most present-coupled) plausible reading** of the interval, and
  do not advance an artifact past `B` or `3 · B` until even that reading has
  crossed it. No age is displayed (`QD14`), so the imprecision matters only to
  the admission decision, never to presentation.
- Age changes while the page is open, but monotonicity is conditional, not
  automatic. Maturity may advance one-directionally
  (`QM1 → QM2 → QM3 → QM4`) only while three preconditions all hold: the
  **same verified artifact identity** backs the estimate across renders (a
  recycled renderer element is not the same artifact), the **publication
  evidence is stable** (the extracted date has not changed value or become
  unparseable since the last estimate), and the **wall clock is
  nondecreasing**. If identity changes, the evidence contradicts the prior
  estimate, or the clock is not observed to be nondecreasing, the estimate is
  invalidated rather than carried forward — the card **fails closed to `QM0`**
  and is re-estimated from scratch, never left at its last-known class.

## 8. What this story explicitly is not

Recorded because each is a plausible misreading of the sections above, and one
of them has already been proposed once.

- **Not a better recommender.** No ranking, no relevance scoring, no
  personalization. The capsule does not want a smarter feed; it wants a quieter
  one.
- **Not content classification.** No LLM deciding whether a video is
  clickbait or political. Semantic classification requires reading the
  semantics, which is the thing the extension exists to prevent, and it would
  replace a boundary the user can reason about with an estimator they cannot.
- **Not digital-wellbeing.** No streaks, no time budgets, no weekly reports,
  no moralizing copy. Under QD7 the absence of activity is the goal, so
  instrumenting activity measures the wrong thing.
- **Not more reveal stages.** Splitting disclosure into six steps instead of
  three adds ceremony and changes nothing about eligibility.
- **Not a relevance or dismissal loop.** Watch/Save/Dismiss is the right
  product for a different user story — one where the user is choosing among
  recommendations. Here they are declining to receive them.

## 9. Falsifiers

How the author would know this document is wrong. Written down because the
value of stating a story is that it can be found to be the wrong story.

- **QD2 is wrong** if, after living behind a temporal boundary, the feed still
  feels loud. Then the missing quality was distance (QD8), not eligibility, and
  the boundary was a more elaborate version of the friction already present.
- **QD3 is wrong** if `QM0` swallows most of the page. A capsule in which
  everything is unverified is indistinguishable from an extension that hides
  YouTube, which is a `hosts` file and not this.
- **QD7 is wrong** if the sealed states become the thing the user looks at —
  if even a bare age reads as a waiting room. `QD11` and `QD14` remove held
  cards and every age from the page for exactly this reason; the falsifier is
  the user checking on cards regardless.
- **QD13 is wrong** if the owner holds for faces routinely. Then the plate is
  standing between them and something they use to choose, and the answer is to
  revisit `QD12`, not to shorten the hold.
- **QD15 is wrong** if the lane becomes how the present arrives: a current
  event reaching the owner through a soundtrack's title, thumbnail or channel.
  Then opacity is narrower than `H2` assumed, and the lane's signals tighten.
- **The whole story is wrong** if `B` keeps getting lowered in practice. A
  boundary that erodes under use is a boundary the user does not actually
  want, and the honest response is to record that rather than to add a
  confirmation dialog in front of the setting.

## 10. Amendment protocol

1. Numbers are hand-assigned and never reused. Superseded results are marked
   superseded in place and the replacement gets a new number, so existing
   citations keep resolving.
2. A behavioural change that contradicts a `QD` number amends this file in the
   same commit, or does not land.
3. A change that is _derivable_ from a `QD` number says so in the commit
   message, with the citation — the same discipline
   `docs/canon/README.md` asks for.
4. This document has one reader whose values it records. It is revised when
   those change, not when a feature is convenient.

---

**See also:** [`absent-plated-heard.md`](./absent-plated-heard.md) — what
`QD11`–`QD17` look like on youtube.com, and the design review that settled
them.
