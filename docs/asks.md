# Asks: what waits on the owner

An ask is one decision an agent can't make and the owner must. Each is its
own GitHub issue, so it has a stable number, a public page, and an end:
closing it answers it. The weekly call (`packages/video-render/src/call.ts`)
reads every open ask into its "waiting on you" section, so the owner hears
each one with its options instead of finding it in a session or an epic.

## When to file one

File an ask when work stops on a decision only the owner can make: a product
call, a preference, a step on their own devices or accounts. Don't file one
for something an agent can decide, or for a question a check or a convention
already answers. Make the call, and record it as `docs/calls/<ID>.json` (CLAUDE.md, "Two
kinds of pull request").

One issue per decision. An epic's "Where we are" and the Residual Ledger's
`first_step` link the ask rather than restating it.

## The issue

- **Title:** `[ASK] <the question>`.
- **Labels:** `ask`, plus the epic's area labels if it has them.
- **Body:** a few lines of prose for a reader on GitHub, then exactly one
  fenced block, opened with ` ```json ask `, holding the ask.

An ask is one of two kinds, its `kind`. Every kind carries the same shared
part, since every ask is the same thing underneath: something is held up
until the owner decides or does it (C1200).

- `question`: one sentence the owner can answer or act on.
- `whyYours`: why an agent can't decide or do it.
- `waits`: who is held up until it is answered: `claude` (a session's next
  step), `pipeline` (a workflow, a render, a release) or `home` (a service
  on the home network).
- `call`: what kind of call it is, from the owner's list (#3425):
  `architecture`, `mechanical`, `hardware`, `software`, `environment`,
  `story` or `idiom`.
- `unblocks`: what answering it lets go ahead, in the owner's words.
- `refs`: the epic, stories and pull requests it is about. The ask's own
  issue is added for you.

The kind's own part is the only one that differs: a decision's `options`, a
checklist's `steps`.

### A decision

The owner chooses between options.

```json ask
{
  "schema": "some-ui.ask/3",
  "kind": "decision",
  "question": "Who answers between turns of a conversation?",
  "whyYours": "It decides what the conversation is: a product call, not a code one.",
  "waits": "claude",
  "call": "story",
  "unblocks": "the conversation's next stories (TALK3, TALK6, TALK9)",
  "options": [
    { "says": "A live model", "unblocks": "TALK3, TALK6 and TALK9" },
    { "says": "A scripted reply", "unblocks": "TALK3 only" }
  ],
  "recommended": 0,
  "refs": [{ "repo": "some-ui", "kind": "issue", "number": 2545 }]
}
```

- `options`: two to four, each with what it `says` and what choosing it
  `unblocks`. Say each in the owner's terms, never the machinery behind it.
- `recommended`: the option the agent would take, by its place in `options`.
  Leave it out when the agent has no view.

A block filed before `/3` still reads: `some-ui.ask/1` (no `kind`) as a
decision, and `some-ui.ask/2` as its kind. What it never said (`waits`,
`call`, and a decision's `unblocks`) reads as unclassified, and the Asks
page shows it that way. File every new ask as `/3`.

### A checklist

The owner takes a few steps only they can: setting up a key, a secret, a
setting on an account. Each step says what to do, in order, and where, and,
when there is a result worth handing back (a log's last lines, an address),
what to paste.

```json ask
{
  "schema": "some-ui.ask/3",
  "kind": "checklist",
  "question": "Will you set up the Grafana key home's photographer reads with?",
  "whyYours": "It is a credential only you can make, on home.",
  "waits": "pipeline",
  "call": "environment",
  "steps": [
    {
      "says": "A Grafana key",
      "where": "Grafana on home",
      "do": [
        "Administration → Users and access → Service accounts → Add service account",
        "Name it site-shots, with the Viewer role, and add a token with no expiry"
      ]
    },
    {
      "says": "Redeploy home",
      "where": "a terminal in paulgsc/server",
      "do": ["Redeploy home as you usually do"],
      "paste": "The deploy's last lines"
    }
  ],
  "unblocks": "the server card's clip on the public site",
  "refs": [{ "repo": "some-ui", "kind": "issue", "number": 3415 }]
}
```

- `steps`: one to twelve, in order, each with what it `says` (a few
  words), `do` (one to twelve lines), and optionally `where` and `paste`.
  More than twelve steps is two asks.
- Never ask for a secret's value to be pasted. A step that makes one says
  where it is pasted instead (a secrets file, a repository's settings).

`parseAskBody` in `packages/video-render/src/ask.ts` is the schema. An ask it
can't read is left out of the call, and the weekly run says which one and why.
The kinds are one family: a new kind is a member of `/3`'s union on `kind`
(`AskV3Schema`), and every reader that switches on `kind` (`callOptionsOf`
for the call, the Asks page's receipt) fails to compile until it says what
the new one is (C1095).

## Where the owner sees them

The weekly call reads every open ask into "Waiting on you"
(`packages/video-render/CALL-ROUTINE.md` says how a checklist is said).

**Asks**, on the home network's desktop web (`/asks`, account-only), lists
every ask, read from GitHub's public list each time it opens: the open ones,
which wait, and the hundred closed most lately in each repository, which were
answered. Filing the issue puts it there and closing it answers it, so nothing
else needs telling (C1200, C1201). Each kind has its own page
(`/asks/decisions`, `/asks/checklists`), never mixed, under a nav that counts
what waits of each. Every row has the same shape whatever its kind: what it
asks, who waits on it, what it unblocks, the kind of call, and since when.
Chips over those fields pick who waits, the call, waiting or answered, and
the order (waiting longest, newest, A to Z); answered asks come last under
every order. A third page, the pivot (`/asks/pivot`), counts the asks by call
and by who waits, each cell split by kind and opening that kind's list
already picked. An ask filed before `/3` shows what it never said as "Not
said".

A row opens to its ask: a decision shows its options, each a choice; a
checklist shows its steps, each with a box for what to paste back and Done.
Every choice and step goes on the ask's receipt, which one button copies.
The receipt is how the owner hands an answer back; it never marks an ask
answered, which only closing its issue does. What the owner does there stays
in that browser tab, blanked of anything shaped like a key or a password,
and leaves only as that copy (C1096). Neither the public site nor the
Android app shows asks (C1097).

## Answering

The owner answers on the issue, by saying which option or that the steps are
done, or by pasting the page's receipt into a session, which writes the
answer on the issue. The session that acts on the answer closes the ask, and
updates the epic and the ledger.

The phone's Studio no longer takes an answer by voice (SFEED5, #2746, retired
by C1097). An answer it recorded before then is still on home and is still
filed by the reflections routine (`packages/ui/topik/ROUTINE.md`, part E).
