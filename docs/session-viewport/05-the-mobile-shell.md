# The mobile shell: `V` is the screen, and the chrome is an icon

> Findings and decisions for the small-screen session player. Read
> `01-overflow-doctrine-and-audit.md` first for the invariant, and §2 of it
> in particular — the overlay-plane exemption is the rule this note leans on
> and then partly declines to use.

## What was wrong

The session player route had never been looked at below 768px. Everything it
rendered was defensible on a wide screen and, stacked on a 390×800 phone,
added up to a viewport the activity barely got a share of:

| band                      | cost   |
| ------------------------- | ------ |
| dashboard header          | 56px   |
| route padding (`p-6`, ×2) | 48px   |
| now/next strip            | ~24px  |
| transport row             | ~76px  |
| viewport border + radius  | 2px    |
| **chrome**                | ~206px |
| **activity**              | ~594px |

Roughly a quarter of the screen, on the one route whose entire content is the
activity. And the worst of it was not the arithmetic: the viewport carried a
**"Press E to edit layout"** button, advertising a mode that on a phone
cannot be entered at all. Every gesture the live layout editor offers assumes
hardware that is not there — `E` needs a keyboard, resize needs a right-click,
retopologising needs a hovering pointer.

So the phone was being shown a control it could not use, in a frame inset
from the edges of a screen with no room to spare, wrapped around an activity
that had been squeezed to make room for both.

## The decisions

### 1. Below the mobile breakpoint, on this route only, the shell disappears

`routes/_dashboard.tsx` drops the header and the padding when
`isViewportPath(pathname) && useIsMobile()`. Scoped to that conjunction
deliberately: every other route is an ordinary scrolling document that wants
its header, and a wide session player has room for one.

### 2. The layout editor is desktop-only, not desktop-first

`SessionViewport` renders no `LiveEditOverlay`, no edit-mode button, no frame
and no autosave notice on a phone. Not "smaller" — absent. A notice about a
layout write failing is a report about a thing the reader did not do and
cannot retry.

`useLiveLayoutEditor` still runs: it holds this session's layout and its
autosave, both of which matter regardless of who is allowed to edit them.
What is suppressed is every affordance for _editing_, not the state.

### 3. The chrome folds into one control, not two

The header and the transport row are separate concerns on a desktop and are
folded together on a phone (`components/player/session-chrome.tsx`). Two
floating controls would be two things to aim at and two things in the way,
and from the reader's position mid-activity both mean the same thing: _not
the activity_. They stay visibly separate inside the sheet — the session's own
controls first, the app's chrome under a rule beneath.

The frequency is what justifies folding rather than shrinking: over a
ten-minute session a person touches Pause perhaps once and Theme
approximately never, while they look at the activity continuously. Chrome
used once should not be resident for ten minutes. A shrunken transport row
would still be a permanent band, with targets smaller than a thumb.

### 4. The sheet is on the overlay plane. The trigger is not.

This is the one worth recording, because the first implementation got it
wrong and the failure was invisible in every test.

§2 of `01-overflow-doctrine-and-audit.md` exempts an overlay plane from
`Layout(t)`, and the sheet is squarely that. So the trigger was floated into
the viewport's top-right corner too — where it landed on LeetType's own
progress counter.

That was not a LeetType problem. **The host has no idea what any applet
paints in any corner, so every corner is somebody's content.** A floating
trigger over a full-bleed leaf is a collision waiting for whichever activity
is unlucky, and the registry contract (an entry renders with no props and no
ambient context) means the host cannot ask a leaf to reserve room either.

So the trigger gets a 36px strip of its own, above `V`, and `V` is what
remains. Against the ~206px it replaces that is a good trade, and in exchange
no activity is ever painted across by the host.

The general rule, stated so the next overlay does not have to rediscover it:

> A **transient** surface (sheet, toast, dialog) may paint over `V`, because
> the person summoned it and it goes away. A **persistent** affordance may
> not, because nothing about `Layout(t)` tells the host which pixels of a
> leaf are safe to cover forever.

## What it costs now

| band                 | cost                             |
| -------------------- | -------------------------------- |
| chrome trigger strip | 36px                             |
| **activity**         | 762px — 95% of an 800px viewport |

Measured in Chromium at 390×800 on the real route, not computed from the CSS.

## What this deliberately does not do

- **No mobile-only layout tree.** The solver, the layout, and the registry are
  untouched; a phone runs the same `Layout(t)` a desktop does, minus the
  ability to edit it.
- **No per-activity mobile shell.** The chrome is the same for every activity.
  Whether a given applet is usable at 390px is that applet's business — this
  note is about giving it the room to be, not about making it so. LeetType
  answers that question for itself (`docs/leetype/README.md`, LTY-MOBILE);
  the others have not been asked yet.
- **No breakpoint of its own.** `useIsMobile`'s 768px, from `some-ui-utils`,
  reused rather than re-picked. The workspace has exactly one answer to "is
  this a phone" and a second would drift from it.
