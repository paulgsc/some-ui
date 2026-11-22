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

An ask is one of two kinds, its `kind`. Both carry:

- `question`: one sentence the owner can answer or act on.
- `whyYours`: why an agent can't decide or do it.
- `refs`: the epic, stories and pull requests it is about. The ask's own
  issue is added for you.

### A decision

The owner chooses between options.

```json ask
{
  "schema": "some-ui.ask/2",
  "kind": "decision",
  "question": "Who answers between turns of a conversation?",
  "whyYours": "It decides what the conversation is: a product call, not a code one.",
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

A block in the first schema, `some-ui.ask/1`, has no `kind` and reads as a
decision, so asks filed before kinds still read.

### A checklist

The owner takes a few steps only they can: setting up a key, a secret, a
setting on an account. Each step says what to do, in order, and where, and,
when there is a result worth handing back (a log's last lines, an address),
what to paste.

```json ask
{
  "schema": "some-ui.ask/2",
  "kind": "checklist",
  "question": "Will you set up the Grafana key home's photographer reads with?",
  "whyYours": "It is a credential only you can make, on home.",
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
  "unblocks": "the server's dashboard pictures on the public site",
  "refs": [{ "repo": "some-ui", "kind": "issue", "number": 3415 }]
}
```

- `steps`: one to twelve, in order, each with what it `says` (a few
  words), `do` (one to twelve lines), and optionally `where` and `paste`.
  More than twelve steps is two asks.
- `unblocks`: what finishing every step lets go ahead.
- Never ask for a secret's value to be pasted. A step that makes one says
  where it is pasted instead (a secrets file, a repository's settings).

`parseAskBody` in `packages/video-render/src/ask.ts` is the schema. An ask it
can't read is left out of the call, and the weekly run says which one and why.
The kinds are one family: a new kind is a member of `/2`'s union on `kind`
(`AskV2Schema`), and every reader that switches on `kind` (`callOptionsOf`
for the call, the Asks page's receipt) fails to compile until it says what
the new one is (C1095).

## Where the owner sees them

The weekly call reads every open ask into "Waiting on you"
(`packages/video-render/CALL-ROUTINE.md` says how a checklist is said).

**Asks**, on the home network's desktop web (`/asks`, account-only), lists
every open ask, read from GitHub's public list each time it opens: filing the
issue puts it there and closing it takes it away, so nothing else needs
telling. A decision shows its options, each a choice; a checklist shows its
steps, each with a box for what to paste back and Done. Every choice and step
goes on the ask's receipt, which one button copies. What the owner does
there stays in that browser tab, blanked of anything shaped like a key or a
password, and leaves only as that copy (C1096). Neither the public site nor
the Android app shows asks (C1097).

## Answering

The owner answers on the issue, by saying which option or that the steps are
done, or by pasting the page's receipt into a session, which writes the
answer on the issue. The session that acts on the answer closes the ask, and
updates the epic and the ledger.

The phone's Studio no longer takes an answer by voice (SFEED5, #2746, retired
by C1097). An answer it recorded before then is still on home and is still
filed by the reflections routine (`packages/ui/topik/ROUTINE.md`, part E).
