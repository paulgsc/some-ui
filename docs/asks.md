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
already answers. Make the call, and record it under "Calls I made" on the PR.

One issue per decision. An epic's "Where we are" and the Residual Ledger's
`first_step` link the ask rather than restating it.

## The issue

- **Title:** `[ASK] <the question>`.
- **Labels:** `ask`, plus the epic's area labels if it has them.
- **Body:** a few lines of prose for a reader on GitHub, then exactly one
  fenced block, opened with ` ```json ask `, holding the ask:

```json ask
{
  "schema": "some-ui.ask/1",
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

- `question`: one sentence the owner can answer.
- `whyYours`: why an agent can't decide it.
- `options`: two to four, each with what it `says` and what choosing it
  `unblocks`. Say each in the owner's terms, never the machinery behind it.
- `recommended`: the option the agent would take, by its place in `options`.
  Leave it out when the agent has no view.
- `refs`: the epic, stories and pull requests it is about. The ask's own
  issue is added for you.

`parseAskBody` in `packages/video-render/src/ask.ts` is the schema. An ask it
can't read is left out of the call, and the weekly run says which one and why.

## Answering

The owner answers by saying which option, on the issue or by voice on the
ask's page in Studio (SFEED5, #2746). Home keeps a spoken answer, the take and
its transcript, and the daily reflections routine files it as a pending issue
in the ask's repository, labelled `pending` and `from-studio`, in its own words
(`packages/ui/topik/ROUTINE.md`, part E). The ask stays open until then. The
session that acts on the answer writes it on the issue, closes it (and the
pending issue), and updates the epic and the ledger.
