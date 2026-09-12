# ADR 0001 — Active-only time model (no idle or background time)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Refs:** [README — What it does](../README.md)

## Context

A tab time tracker can measure several different things: total time a tab has been open, time the tab was in the foreground, time the user was actively interacting with the tab, or some weighted combination. The choice determines what the data actually means and whether it is useful for accountability.

## Decision

Measure **active foreground time** only: the clock runs only when the tab is the active tab in the focused browser window. It pauses on:
- Browser blur (user switched to another application)
- Tab switch (user switched to another tab)
- Window switch (user switched to another browser window)

Background time (tab open but not in focus) is explicitly not counted.

## Trade-offs accepted

- "Active time" understates total engagement time — a video playing in a background tab adds zero time. This is a deliberate choice: the ledger measures *attention*, not presence.
- Implementation requires listening to `visibilitychange`, `focus`/`blur`, and `tabs.onActivated` across both content script and background; these must be kept in sync.

## Alternatives rejected

- **Total open time:** measures "how long was this tab open", not "how long did I spend on this tab". A tab open for 8 hours while working in another app would record 8 hours. Misleading. Rejected.
- **Interaction-gated time (active typing/scrolling only):** too aggressive — reading a long article with no input still counts as active attention. The tab being in the foreground in a focused window is the right proxy. Rejected.
