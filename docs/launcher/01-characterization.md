# What actually breaks at N = 10, 20, 50

> Story #853, epic #852. Measured before anything was redesigned, so the rest
> of the epic had something to be measured against rather than an inference.

The claim the epic opened on was that the quick launch — `ACTIVITY_IDS.map`
into `grid gap-3 sm:grid-cols-2 lg:grid-cols-4` — breaks as the catalogue
grows, and that it only looks polished today because there are exactly four
activities and `lg:grid-cols-4` is exactly four columns.

That was an inference. It is now measured, by
[`apps/www/tests/ui-fit/launcher-fit.spec.ts`](../../apps/www/tests/ui-fit/launcher-fit.spec.ts),
against the synthetic catalogue in `@some-ui/activity-catalog`.

## The numbers

Height of the "Start something new" section, and where "Recent sessions"
lands relative to the fold (negative = still visible). `legacy` is the
pre-#852 grid; `k recommended` is what ships now.

### short-laptop (1280 × 560)

| N   | legacy section | "Recent sessions" | k recommended | "Recent sessions" |
| --- | -------------- | ----------------- | ------------- | ----------------- |
| 4   | 305px          | −7px              | 357px         | +45px             |
| 10  | 882px          | +570px            | 357px         | +45px             |
| 20  | 1438px         | +1126px           | 357px         | +45px             |
| 50  | 3788px         | +3476px           | 357px         | +45px             |

### phone (390 × 720)

| N   | legacy section | "Recent sessions" | k recommended | "Recent sessions" |
| --- | -------------- | ----------------- | ------------- | ----------------- |
| 4   | 1139px         | +667px            | 441px         | −31px             |
| 10  | 2807px         | +2335px           | 441px         | −31px             |
| 20  | 5587px         | +5115px           | 441px         | −31px             |
| 50  | 13927px        | +13455px          | 441px         | −31px             |

### desktop (1680 × 1050)

| N   | legacy section | "Recent sessions" | k recommended | "Recent sessions" |
| --- | -------------- | ----------------- | ------------- | ----------------- |
| 4   | 305px          | −497px            | 357px         | −445px            |
| 10  | 882px          | +80px             | 357px         | −445px            |
| 20  | 1438px         | +636px            | 357px         | −445px            |
| 50  | 3725px         | +2923px           | 357px         | −445px            |

## What breaks, worst first

1. **The phone was already broken at N = 4.** This is the finding that was
   not in the epic. The old grid had no `grid-cols-*` at the base
   breakpoint, so below `sm` it was one column and four activities stacked to
   1139px — nearly double a 720px phone viewport, with "Recent sessions"
   667px past the fold. The catalogue-size argument was real, but the phone
   did not need a catalogue to fail; it needed a second column. `k`'s
   breakpoint ladder starts at `grid-cols-2`, which is why the phone improves
   at N = 4 rather than merely stopping getting worse.

2. **Recent sessions goes off the first screen between N = 4 and N = 10.**
   On the short laptop it happens at N = 10 (+570px); on the desktop it takes
   until N = 10 as well (+80px). The epic guessed "at N = 20 it pushes
   everything below it off the first screen". It is closer to N = 6.

3. **The profile summary survives, and that is the wrong consolation.** It
   sits above the launcher, so it is never pushed anywhere. What it means is
   that the first screen degrades into "who you are" and "a wall of
   activities", with nothing you were in the middle of.

4. **Growth is linear and unbounded.** 3788px of launcher at N = 50 on a
   560px window is not a layout with a bad breakpoint; it is a list wearing a
   grid. `overflow-y-auto` on the page is the obvious repair and is banned
   here by `fits-the-box/no-greedy-overflow` — which is what forced the rest
   of the epic to be design work rather than a one-line fix.

5. **The composer's picker fails the same way, one step later.** Its two-column
   grid runs 2181px past the fold at N = 20 and 6036px at N = 50 on the short
   laptop. Half of that file already paged its _picked items_ list; only the
   catalogue grid above it did not.

## What it cost to fix

The `k recommended` launcher is **52px taller than the legacy one at N = 4**
(357 vs 305) on the wide viewports. That is the search field and the "Browse
all" affordance, and it is a real regression at today's catalogue size — it
is the reason "Recent sessions" is 45px below the fold on the short laptop
where it used to be 7px above it.

It is recorded here rather than smoothed over, because it is the honest shape
of the trade: a fixed 52px, once, in exchange for a launcher whose height
stops depending on N at all. At N = 6 it has already paid for itself, and the
phone is better off immediately.

## What is enforced, and what is not

The fit spec pins both halves: the legacy fixture must still be seen to grow
(otherwise the enforcement cases prove nothing), and the shipped fixture's
footprint must not depend on N. Reverting #854 turns the second half red —
verified by doing it.

What the spec does **not** do is render the real components. It mirrors the
shipped CSS chain, following the precedent set by
`tests/session-viewport/no-overflow-scroll.spec.ts`, because `/app` needs a
router, a query client and seeded tenant storage to mount. The mirror can
drift. The check that cannot drift is the Storybook sweep next door — and it
globs `packages/**` and `extensions/**` only, so it never sees `apps/www`.
Widening those globs (which means giving `apps/www` components stories, which
means a router decorator) is the honest follow-up to this story, and is not
in it.
