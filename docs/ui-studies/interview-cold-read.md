# The interview pages, read cold

A blind read of the phone's interview week (Jobs › Interview, #2931), against a
design-only prototype of the same pages built layer by layer. Run 2026-11-18 for
the owner, who said of the current first page: "it's like a wall of text… It's
almost as if you just start with exam question one, rather than the page that
introduces what is going on" (spoken 2026-11-18; the full words are on the
epic). The question was whether a reader with no context finds that for
themselves.

- **Prototype:** https://claude.ai/artifact/KkNQsBwJTGyoamZQQupSDi (private to
  the owner). The ladder pages agreed on 2026-11-17
  (https://claude.ai/artifact/3qFe2qLVB2qabmdVcjBArp) stay as they are.
- **Calls:** C620–C624 (`docs/calls/`).

## Result

| Arm       | Reader | Saw             | R1 purpose | R2 first action | R3 time | R4 where takes go | R5 essay | R6 history | Total /12 |
| --------- | ------ | --------------- | ---------- | --------------- | ------- | ----------------- | -------- | ---------- | --------- |
| Current   | A1     | every page      | 2          | 2               | 2       | 1                 | 0        | 0          | 7         |
| Current   | A2     | every page      | 2          | 2               | 2       | 1                 | 0        | 0          | 7         |
| Current   | A3     | first page only | 2          | 1               | 1       | 1                 | 0        | 0          | 5         |
| Prototype | B1     | every page      | 2          | 1               | 2       | 2                 | 2        | 2          | 11        |
| Prototype | B2     | every page      | 2          | 2               | 2       | 1                 | 2        | 2          | 11        |
| Prototype | B3     | first page only | 2          | 2               | 2       | 0                 | 1        | 2          | 9         |

Arm means: today's pages 6.3, the prototype 10.3. The first scores published on
this PR's first head (6, 6, 5 against 12, 11, 11) applied the hedge rule
unevenly, each slip in the prototype's favour; an independent review rescored
them, and these are its scores, which I agree with.

The readers of today's pages all understood that this is interview practice,
and all started on today's question. None of them knew that a video essay comes
of their takes, none could find last week, and none knew what "home" is:
"'Home' is never explained, though everything turns on it" (A1). Each estimated
the time themselves by summing the per-item times, and said so: "the app never
states a total" (A1).

The readers of the prototype found the same three things the owner named. B3 saw
only the first page and still answered where last week is and what the week
costs, and that an essay comes, though not for sure that it is made from the
takes ("I'm guessing the essay is built from my recordings"). Where takes go was
the thing the prototype's first page left to the next page: "The screen doesn't
say where the takes are stored or who sees them. It only points me to 'How a
week goes' for that" (B3). The first page should say it in a line.

The first page the prototype arm read lists decision drills, which are not
built (IW13, #3181), and every B reader counted the drill in the week's time.
The prototype recommends that the phone list only built kinds (C624), so the
page that would ship today differs from the one tested by that one row.

**Read with care.** Three readers an arm is a small sample, and the readers are
fresh-context model sessions, not people. I designed the prototype and fixed the
rubric, and the rubric's six points come from the owner's own list, which the
prototype was drawn to answer, so the B arm was graded on what it was built for.
The prototype was drawn after A3's answer had come in and while A1 and A2 ran;
it changed nothing in the rubric. What the study does show is that each of the
missing things is missing from today's pages for a reader who knows nothing,
which is what the owner said "they'll stumble upon themselves".

## Method

**What was rendered.** The interview pages live under `_apk`, whose layout
sends any profile without the `apk` audience to not-found (`requireAudience`),
and render only with `VITE_DEVICE_BACKEND` besides, so the `lan` and `pages`
profiles show none of them.
They were rendered from the ui-fit phone page instead (`pnpm --filter www
build:fit-phone`, the `mobile` profile, `tests/ui-fit/phone-page/interview.tsx`):
the routine's week `/2` (`WEEK_2`, Tidewell) over the fixture's ports and the
simulated microphone, at 390×844. Two scratch fixtures were added for the run and
not committed: `NoInterviewWeek` alone, and the same week with the cue's clock
running so a take could be recorded. The fixture draws the interview's pages
without the app's header or the Jobs view strip.

**States captured** (13 screens): no week on the phone; the first page, empty;
today's question and its ladder; Read the answer; Read it aloud before, counting,
recording and after a take; the question and the first page with that take; Read
aloud and one read; the look over.

**Two capture artifacts**, discounted in scoring:

- The full-page captures of the first page and the look over cut the last line
  short ("Until then you can say…"). The page itself scrolls to the end; my
  capture's height was a few pixels short. A1, A2 and A3 each named it.
- The recorder showed "0:03 / 1:00". The fixture's ports use the shared one-take
  limit of a minute (`ONE_TAKE`); the phone's own ports set 2 minutes
  (`lib/interview-week/index.ts`). Every reader who recorded named the mismatch.

**The prototype arm** saw the prototype's new pages (the first page in three
week states, How a week goes, Questions, Read aloud, Decision drills, one drill,
Past weeks, History) with the current app's own ladder and recording screens in
between, since those stay.

**Readers.** Six fresh-context subagents, each given only the screenshots, a
line per screen saying what was tapped, and the questions below, and told to
open nothing else. Two per arm saw every page; one per arm saw the first page
alone, to test the first page on its own.

**Questions** (the same for every reader):

1. What is this section of the app for?
2. What would you do first, and why?
3. What happens to what you record? Where does it end up, and what, if anything,
   comes of it afterwards?
4. How long will this take you, today and over the week?
5. Where would you find what you did last week?
6. What, if anything, confused you or made you hesitate?

**Rubric**, fixed before any answer was read. Each point scores 0 (wrong, absent
or "can't tell"), 1 (partly right or a hedged guess) or 2 (right, and said
without doubt):

- **R1 Purpose:** practising spoken answers to job-interview questions, a new
  set each week, for an invented company and role.
- **R2 First action:** a concrete first step (today's question, step 1, or a
  kind of practice), named without doubt.
- **R3 Time cost:** a realistic estimate per item and per week (minutes per
  question, a handful of items, the week closing Sunday).
- **R4 Where takes go:** to the owner's home store (a question's first take at
  once, the rest when the week is sent), and found again in Studio's Takes.
- **R5 Video essay:** knows the week's takes become a video essay.
- **R6 History:** knows where to find last week's interviews.

Question 6 is logged, not scored.

## What the readers stumbled on

In today's pages, beyond the six points:

- **Today's question is "Question 2" in the look over** (A1, A2). The look over
  numbers by the week's order, while the first page puts today's question first.
- **A first take reads as both sent and not sent** (A2): it says "On this phone,
  going home", the first page says it "goes home on its own", and the look over
  counts it in "Send to home · 1 take". In the fixture home is near and holds
  nothing, so the take may simply not have gone yet; worth checking on the phone.
- **The countdown and its button disagree** (A1, A2): "Recording in 2" shows
  while the button still says "Tap to talk".
- **"Delete all" beside "kept for good"** (A1, A2), and "Sent as it is, it goes
  as passed over" (A1, A2), read as unclear.
- **"Read it aloud" and "Read aloud" are near twins** (A2): a step of a question
  and a kind of practice share a name.
- The ready answer read as jargon (A1, A2, B1, B2). That text is the fixture's
  synthetic answer (`readyAbout` in the week's test fixture), not a real week's,
  so it says nothing about the routine's answers.

In the prototype:

- **Home still takes a re-read** (B1, B2), and the rule "the first take goes on
  its own, the rest when you send" is the part that does. B2 also caught "One
  take is on this phone" beside that rule. Saying where each take is, take by
  take, may serve better than stating the rule.
- **"This week's essay" opened the list of past weeks** (B1), not the week. It
  should open that week, with its essay's status.
- **After sending, Past weeks still said "Open until Sunday"** (B1). Both are
  true; the row should say sent first.
- **A drill's record button before a pick** (B2): it should wait for the pick.
- **"Week 47"** made B3 wonder whether earlier weeks were missed.
- **"See what was chosen": chosen by whom?** (B3). The drill should say it is
  the choice made in the work, and when.

## Where each state would be fed from

Checked against the code on 2026-11-18 (`main` at 524d3f0):

| Part                                                     | Fed from                                                                                                                                 | Today                                                                                                                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First page: company, role, dates, kinds and their times  | the week from home (`some-ui:interview-week.weeks`): questions, cards, `targetSeconds`, `opens`, `due`                                   | Exists                                                                                                                                                                                                     |
| A week under way: what was done, where each take is      | this phone's takes and ladder, and what home last heard (`homeHoldsInterviewSend`)                                                       | Exists; not shown this way                                                                                                                                                                                 |
| Sent: when, and that saying again still works            | the sent records (`some-ui:interview-week.sent`) and home's reply                                                                        | Exists                                                                                                                                                                                                     |
| Decision drills: options, the answer, when it was chosen | a call's `options` and `chose` (`docs/calls`), carried by the week                                                                       | New: IW13 (#3181)                                                                                                                                                                                          |
| Past weeks: each week's company and whether it was sent  | the weeks this phone holds and its sent records                                                                                          | Held on the phone, but no page lists them and no route opens an older week (`weekOpenNow` shows one)                                                                                                       |
| Past weeks: a closed week's final record                 | home's `GET /interview-weeks/:id/record`                                                                                                 | Only the essay routine reads it                                                                                                                                                                            |
| Essay ready, its length, a way to watch                  | Studio's `interview-essay` feed                                                                                                          | Exists                                                                                                                                                                                                     |
| Essay being made now                                     | Studio › Renders (`GET /renders`)                                                                                                        | Exists, generic per row                                                                                                                                                                                    |
| Essay scheduled                                          | fixed words: made after the week closes, ready Monday                                                                                    | Words only; a planned time would be new                                                                                                                                                                    |
| The door to Takes                                        | Studio › Takes, `/journal/takes/$kind`                                                                                                   | New: Takes has no interview kind (`TAKE_KINDS` in `packages/ui/soundbites/src/lib/library/compartments.ts`), and `aboutOfRef` would file `<week>:read:<card>` as a scene and `<week>:<question>` as "here" |
| History across the study wings                           | each wing's own record: Rust Rounds' round log, TOPIK's routine runs, LeetType's session log, Bites' store, the interview's sent records | New page and one read over each; no new store. No history across the study wings exists in any build (desktop `/sessions` lists study sessions, not each wing's record)                                    |

## The answers, verbatim

### A1: today's pages, every page

> 1. It is for interview practice. Each week it gives you a made-up company and job (here, "Backend engineer at Tidewell"), a few questions to answer out loud, and a couple of short scripts to read aloud. You record yourself answering, and you can build up to it in steps: read a model answer, read it aloud, answer from a few cue words, then answer with only the question.
> 2. I would tap the highlighted "Today's question" card, because it is the biggest and brightest thing on the page and is clearly where to start. Inside, I would begin with step 1, "Read the answer", to see what a good answer looks like before recording anything. The numbered 1 to 4 order tells me that is how I'm meant to go.
> 3. A recording is kept on the phone first ("Kept.", "On this phone, going home"). The page says the first take of each question goes to "home" by itself, and the rest stay on the phone until I tap "Send to home" on the review page. Whatever "home" has at Sunday 23:59 "counts, and is kept for good", and a question I never answer goes as "passed over". I can't tell what "home" is, maybe a computer or server of the owner's. I also can't tell what comes back afterwards: the demo script says the week "listens", so I'd guess some feedback, but no screen shows any.
> 4. Each answer says "Aim for about 2 min" and each script "about 1 min". With 4 questions and 2 scripts, the recording alone is roughly 10 minutes a week, plus reading time. Today, one question through its four steps might take 10 to 15 minutes. That is my estimate; the app never states a total. The week is due Sunday 23:59, and with one "Today's question" per day, I'd guess a few minutes a day across the week.
> 5. I don't know; no screen showed past weeks. The first screen says a new week arrives from "home" every Monday, so I'd guess last week's takes live there, not in this section. I saw no history or archive button.
> 6. Several things made me hesitate:
>    - "Home" is never explained, though everything turns on it.
>    - The timer read 0:03 / 1:00 while the screen said "A take stops at 2 min" and "Aim for about 2 min".
>    - Today's question shows up as "Question 2" on the review page, though it's listed first on the main page.
>    - The model answer is hard to follow ("make not known yet a state of its own"), and it calls itself "fitted to you" even though the company is invented.
>    - During the countdown ("Recording in 2") the button still said "Tap to talk", so I wasn't sure it had started.
>    - "Delete all" sits right beside text saying things are "kept for good".
>    - "Sent as it is, it goes as passed over" reads awkwardly.
>    - The explanation at the bottom of the main page is cut off mid-sentence.

### A2: today's pages, every page

> 1. It is a weekly interview practice section. Each week brings a made-up company and role (here "Backend engineer at Tidewell"), a few interview questions to answer out loud, and a couple of short scripts to read aloud, all due by Sunday 23:59. For each question it gives four steps that build up: read a model answer, read it aloud, say it from cues, then say it your own way. The aim seems to be getting better at hard spoken questions.
> 2. I would tap the big "Today's question" card, since it is the most prominent thing on the page and clearly marked as today's. On its page I would start with step 1, "Read the answer", so I hear what a good answer sounds like before recording. Then I would move up the steps as far as I felt able.
> 3. A take is saved on the phone ("Kept.") and marked "On this phone, going home". The first take of each question is supposed to go "home" by itself. Later takes stay on the phone until I press "Send to home" on the review page, and whatever home has at Sunday 23:59 "is kept for good". I don't know what or where "home" is, and I'm guessing at what comes back afterwards. The demo script's "a week that asks them, and listens" hints at feedback, but no screen shows any.
> 4. Today's question says to aim for about 2 minutes, the read-aloud scripts about 1 minute each, and a take stops at 2 minutes. Over the week that is four questions and two scripts, so roughly 10 to 15 minutes of recording. With reading the model answers and redoing takes, I'd guess 20 to 40 minutes for the week. That total is my estimate; the screens don't state one.
> 5. I couldn't find it. The first page shows only the current week (Week 47), and I saw no history, archive or past-weeks link. Since sent weeks are "kept for good" at home, I'd guess they live somewhere outside this section, or in a part of the app I didn't see.
> 6. Several things made me hesitate:
>
> - "Home" is never explained, and the first-take note contradicts the send button. A take that "goes home on its own" still shows "On this phone, going home", and "Send to home · 1 take" counts it as not sent yet. I couldn't tell whether it had already gone.
> - The times don't match. The page says "a take stops at 2 min" but the recording timer showed "0:03 / 1:00". The demo script says about 1 minute but also "stops at 2 min".
> - "Read it aloud" (step 2) and the separate "Read aloud" page with its scripts have nearly the same name.
> - Today's question showed up as "Question 2" on the review page, not Question 1.
> - The model answer's wording was hard to follow ("make not known yet a state of its own", "conflict reached the screen as home can't be reached").
> - "Not said. Sent as it is, it goes as passed over" was unclear, as was whether the red "Delete all" deletes for good.
> - The explanation at the bottom of the first page was cut off mid-sentence ("Until then you can say...").
> - I couldn't tell whether recording starts immediately, because a "Recording in 2" countdown appeared while the button still said "Tap to talk".

### A3: today's first page only

> 1. It looks like practice for job interviews. You get a made-up job (backend engineer at "Tidewell", a tide-tables company) and a set of interview questions for the week, and you answer them out loud. It also points to a separate "Read aloud" page with short scripts to read, which I take to be speaking practice.
> 2. I would answer "Today's question" ("Tell me about a time you disagreed with someone at work"), because it is the big highlighted card and it says what it wants: a minute or two. I'm not sure how to start, though. Nothing on the screen says "record". My guess is that tapping the card opens a recorder.
> 3. The bottom text says my first take of each question "goes home on its own". The other takes stay on the phone until I "send the week". Whatever "home" has at Sunday 23:59 counts and is kept for good. I don't know what or where "home" is (a server? the developer?), and the sentence is cut off at "Until then you can say…", so I can't see the rest. The screen doesn't say whether anyone reviews or scores what I send, or what happens to it after that.
> 4. Today it looks like a minute or two for one answer, plus however much retrying I do. Over the week there are four questions (today's and three others), all due Sunday 23:59, so I guess about 10 minutes in total, plus reviewing before sending. "At whatever step you like" suggests I can go at my own pace, but I'm not sure what it means.
> 5. I don't know. This screen shows only Week 47, and I see no history, archive or past-weeks link. My guess is that past weeks are kept "home", somewhere I can't see from here.
> 6. "Home" is never explained, and the most important sentence, about what happens to my recordings, is cut off. I also didn't follow "at whatever step you like", or why the Read aloud box is here when it has its own page. It was unclear whether I can answer the other three questions now or only on their days, and whether "Look it over before sending" sends anything. The "first take goes automatically" rule made me hesitate: my first, worst attempt would be sent without my choosing it.

### B1: the prototype, every page

> 1. It is weekly practice for job interviews, for an invented job ("backend engineer at Tidewell"). I answer interview questions aloud, read short scripts aloud and do decision drills. Then a video essay shows me how I came across: how each answer was built, the ums, the long pauses. It is for practice and feedback, not grading.
> 2. I would open "How a week goes" first, since it explains where my recordings go and when the essay comes. Then I would do Questions, starting with the highlighted "Today's question" ("Why are you looking now?"). The page says I can do the three kinds in any order, so I'm only guessing that Questions is the intended start.
> 3. Each take is saved on the phone ("Kept." and "On this phone, going home"). The first take of each item goes on its own to "home", which the app says is my own computer, not a company's server. The rest go when I tap "Look it over and send". After Sunday 23:59, home makes a video essay from whatever it has, ready on Monday. All recordings can also be heard in Studio › Takes.
> 4. Each item is short: about 2 min per question (4 of them), about 1 min per script (2), about 3 min for the drill. That is roughly 15 minutes for the whole week if I do each once. I'm guessing it could be longer, because each question has four steps and I can redo takes. Today could be a few minutes, since there is one "Today's question". The window closes Sunday 23:59 and the essay arrives the next Monday.
> 5. In "Past weeks", on the section's first page. It lists each earlier week, when it was sent and the state of its essay (for example "Essay ready · 9 min"). For a log of everything I practised across the app, "All your practice" opens History, and the recordings themselves are in Studio › Takes.
> 6. The recording timer showed "0:03 / 1:00" while the text said "A take stops at 2 min", and Read aloud said "about 1 min each" while its screen said "Aim for about 2 min". The sample answers were hard to follow ("make not known yet a state of its own", "conflict reached the screen as home can't be reached"). I hesitated over which of the four steps per question I must do and which one counts. "Home" and "first take goes on its own versus the rest when you send" took a re-read. After sending, Past weeks still called Week 47 "Open until Sunday". Screen 14's caption says I tapped "This week's essay", but it showed the Past weeks list, not an essay page.

### B2: the prototype, every page

> 1. It's a weekly practice interview for a made-up job ("backend engineer at Tidewell"). I answer interview questions out loud, read short scripts aloud, and do decision drills. The following Monday a video essay shows how I came across: how each answer was built, the ums, the long pauses. The screens say it "counts, and never grades".
> 2. I'd tap Questions and start with "Today's question" ("Why are you looking now?"), because it's highlighted as today's. Before that I might open "How a week goes", since the first page links to it and says it explains where my takes go. Within a question I'd go through the numbered steps in order: read the answer, read it aloud, say it from cues, say it your way.
> 3. Each recording stays on the phone at first. The screens call this "Kept." and "On this phone, going home". "Home" is my own computer, not a company's server. The first take of each item seems to go home by itself, and the rest go when I tap "Look it over and send". After the week closes on Sunday at 23:59, home makes a video essay from whatever it has, ready Monday. The recordings also stay in Studio › Takes, and the History list logs what I practised. I'm partly guessing at how "first take goes on its own" and "sending" fit together.
> 4. Each item is short: a question takes about 2 min, a script about 1 min, and a drill about 3 min. A take stops at 2 minutes. The full week is 4 questions, 2 scripts and 1 drill, which by my own sum is roughly 13 to 15 minutes. That's if each one is done once, spread over any days before Sunday. Today could be just one question, a few minutes. The finished essay from an earlier week was listed as 9 min to watch.
> 5. Under "Past weeks" on the section's first page. It lists each week (46 Harrow Lane, 45 Copperline, and so on), what was sent and when, and the essay's status. "All your practice" opens a History list across the whole app, and the recordings themselves are in Studio › Takes.
> 6. These made me hesitate:
>
> - **"Home"**: I didn't know what it means at first or whether I need to set up a computer. The sending rules were confusing too: first take on its own, the rest when sent, yet the first page later said "One take is on this phone".
> - **Recording limits**: the recorder said "A take stops at 2 min" but the timer read "0:03 / 1:00".
> - **The script text**: the ready answer read like jargon ("make not known yet a state of its own", "conflict reached the screen as home can't be reached"), so it was hard to read aloud naturally.
> - **Saving**: "Kept." didn't tell me whether anything had been sent.
> - **The drill**: I couldn't tell if I had to tap an option before "Record why".

### B3: the prototype's first page only

> 1. It's a weekly practice job interview for a made-up job (backend engineer at Tidewell). You answer questions out loud, read scripts aloud and do decision drills. Then you get a video essay about how you came across.
> 2. I'd tap "Questions" first, because it's at the top and sounds like the heart of an interview. I might open "How a week goes" before that, since it says where my takes go and when the essay comes. I'd want to know that before recording anything.
> 3. From the screen, my takes go somewhere, and next Monday a video essay shows how I came across. I'm guessing the essay is built from my recordings. The screen doesn't say where the takes are stored or who sees them. It only points me to "How a week goes" for that. "Past weeks" suggests old interviews and their essays are kept.
> 4. All of it adds up to about 13 minutes: 4×2 for questions, 2×1 for read aloud, and 3 for the drill. Since I can do any part, in any order, on any day until Sunday 23:59, today could be a few minutes or the whole 13. The time I'd spend watching the essay next Monday isn't stated.
> 5. Under "Past weeks" at the bottom, which says "Your earlier interviews and their essays."
> 6. I didn't know where my recordings go, or whether anyone else hears them, without opening another page. I wasn't sure if I had to do all three kinds to get the essay, or if one would be enough. "Week 47" made me wonder whether I'd missed earlier weeks or was joining partway through. "See what was chosen" in Decision drills was vague: chosen by whom?
