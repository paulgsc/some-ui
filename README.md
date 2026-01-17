# Zero-Reasoning Lint Cleanup Workflow

## Project Specification v3.0 (Final)

---

## Executive Summary

**Vision**: Never reason about lints. Ever. All cognitive time spent on business logic only.

**Core Invariant**: At no time t do I think about lint errors. Lint fixes happen in parallel to my work, completely decoupled, completely optional.

**Current State**: File F has lint errors → I edit F for business logic X → commit blocked by lint failures → forced to reason about lints.

**Target State**: File F has lint errors → I edit F for business logic X → commit succeeds immediately → post-commit hook generates lint fix PR in background → I review/merge/ignore whenever (or never).

**Success Metrics**:

- Time spent reasoning about lints: **0 seconds**
- Business logic commits: **never blocked**
- Lint fix PRs: **always optional**

---

## The Core Invariant

### Never Reason About Lints

**At no time t do I:**

- Think about lint errors
- Wait for lint fixes
- Decide whether to fix lints
- Block my work on lint resolution

**All my time is spent on:**

- Business logic
- Product features
- Architecture
- Anything except lints

### The Key Insight

**Any workflow that pauses your commit to wait for lint fixes violates this invariant.**

Even if the pause is "just 15 seconds to paste/copy"—you're still:

- Context-switching to lint mode
- Reasoning about whether to fix or skip
- Blocking your business logic commit

**Wrong mental model:**

```
Edit F → Try to commit → BLOCKED by lints → Fix lints → Commit
                           ↑
                    You're reasoning about lints here
```

**Correct mental model:**

```
Edit F → Commit succeeds immediately → Background process generates lint fix PR
         ↑                              ↑
    Never blocked                 You don't even notice (yet)
```

---

## Problem Definition

### What I Refuse

The most important constraint:

**I refuse to reason about lints at commit time.**

This means:

- ❌ No pre-commit hooks that pause for lint fixes
- ❌ No "fix or skip?" decisions during commit
- ❌ No waiting for LLM responses before commit proceeds
- ❌ No thinking about whether file has lint errors

**My commits represent business logic changes. Period.**

### What I Accept

- ✅ Lint debt exists and accumulates (acceptable)
- ✅ Committing files with lint errors (acceptable)
- ✅ Lint fix PRs appearing later (acceptable)
- ✅ Ignoring those PRs forever (acceptable)
- ✅ Cycle repeating until I choose to merge (acceptable)

**The only unacceptable thing: reasoning about lints when I'm working on features.**

---

## Solution Architecture

### The Webhook Model

When you commit file F with business logic X:

**This is a webhook** that signals:

> "Hey, F was just committed and has lint issues—generate a fix PR in the background"

You don't wait for this. You don't interact with it. You just continue working.

### Complete Decoupling

```
Timeline of Events:

T=0:  You edit F (apply business logic X)
T=1:  git commit -m "feat: implement X"
      ✓ Commit succeeds immediately

T=2:  Post-commit hook detects "F has lint errors"
      → Generates .fix/F.md (background)
      → Copies to clipboard
      → Silent notification

T=10: You paste to ChatGPT (when you notice clipboard)
      [or never—that's fine too]

T=20: You copy diff

T=21: Daemon detects diff
      → Creates branch: lint-fix/F-timestamp
      → Applies patch
      → Opens PR #123

T=∞:  You review PR #123 (someday, maybe, or never)
```

**Notice**: Your business logic commit at T=1 is **never blocked**. The lint fix PR is completely parallel.

### The Cycle

```
File F has lint errors
    ↓
You commit business logic X to F
    ↓
Commit succeeds (never blocked)
    ↓
Post-commit hook generates .fix/F.md
    ↓
Clipboard has prompt
    ↓
[You paste/copy when you notice—optional]
    ↓
Daemon creates PR for lint fixes
    ↓
[You review/merge when you want—optional]
    ↓
IF merged: F becomes clean F'
IF ignored: F still has lint errors
    ↓
Next time you commit to F: cycle repeats
    ↓
Eventually you merge a lint fix PR (or don't)
```

**The cycle is self-sustaining and never blocks you.**

---

## Detailed Workflow

### Phase 1: You Work (Never Interrupted)

```bash
# You're implementing business logic
$ vim packages/ui/input/src/lib/crossword-grid.ts
# ... implement crossword validation feature ...
# (File has 4 existing lint errors—you don't know, don't care)

$ git add crossword-grid.ts
$ git commit -m "feat: add crossword validation"

[main abc1234] feat: add crossword validation
 1 file changed, 45 insertions(+), 3 deletions(-)

# ✓ Commit succeeded immediately
# ✓ Your feature is now in main
# ✓ You continue working on next thing
```

**At this point, you're done thinking about crossword-grid.ts.**

### Phase 2: Background Hook (Silent)

```bash
# Post-commit hook runs (you don't see this)
🔍 Detected commit to file with lint errors: crossword-grid.ts
📝 Generating fix prompt...
📋 Copied to clipboard

# Small desktop notification (optional):
"Lint fix prompt ready for crossword-grid.ts"
```

**You don't interact with this. You might not even notice.**

### Phase 3: Eventually, You Notice

```bash
# Hours/days later, you notice clipboard has something
# Or you see the desktop notification
# Or you just check .fix/ directory

$ cat .fix/crossword-grid.ts.md
# [Contains the fix prompt]

# You paste to ChatGPT (10 seconds)
# You copy the diff (5 seconds)
# Done
```

**This happens when you want it to, not when the system demands it.**

### Phase 4: Daemon Creates PR (Automatic)

```bash
# Daemon detects diff in clipboard
🤖 lint-janitor: Detected diff for crossword-grid.ts
✓ Validated patch
✓ Created branch: lint-fix/crossword-grid-ts-20260115
✓ Applied 4 lint fixes
✓ Committed: "fix(lint): resolve 4 issues in crossword-grid.ts"
✓ Pushed to origin
✓ Opened PR #456: "Lint fixes for crossword-grid.ts"
```

**Notice**: This PR is separate from your business logic commit. Your feature is already in main.

### Phase 5: You Review (Whenever, Maybe)

```bash
# Days/weeks later (or never)
$ gh pr list
#456  Lint fixes for crossword-grid.ts  lint-fix/crossword-grid-ts-20260115

# You review the PR (just lint fixes, nothing else)
$ gh pr diff 456
# Looks good
$ gh pr merge 456

# F is now clean
```

**Or you ignore it forever. That's also fine.**

---

## Key Architectural Decisions

### Decision 1: Post-Commit Hook, Never Pre-Commit

**Why Post-Commit?**

Pre-commit hooks can **block** commits:

```bash
$ git commit
Running pre-commit hooks...
❌ Waiting for lint fixes...  ← You're blocked here
```

Post-commit hooks **never block**:

```bash
$ git commit
✓ Committed
Running post-commit hooks...  ← Happens after your work is done
```

**Rationale**: Your business logic commits must succeed immediately, unconditionally.

### Decision 2: Separate PR for Lint Fixes

**Wrong Model:**

```
Commit 1: "feat: add validation + lint fixes"
  - Business logic
  - Lint fixes
  [both in same commit]
```

**Correct Model:**

```
Commit 1: "feat: add validation"
  - Business logic only
  - Already in main

PR #456: "Lint fixes for crossword-grid.ts"
  - Lint fixes only
  - Optional, can ignore
```

**Rationale**:

- Your feature commit is clean (business logic only)
- Lint fix PR can be reviewed/merged/ignored independently
- If you never merge, file stays broken (acceptable)

### Decision 3: Prompt Available, Not Required

**Wrong Model:**

```
Post-commit: "YOU MUST PASTE THIS PROMPT NOW"
```

**Correct Model:**

```
Post-commit: "Prompt is in .fix/ and clipboard if you want it"
```

**Rationale**: You might be in flow state. You might be moving to the next feature. The prompt can wait.

### Decision 4: Cycle Repeats Until Resolved

If you ignore the lint fix PR:

- File still has lint errors
- Next commit to that file → new prompt generated
- New PR created
- Cycle continues

**This is fine.** The system keeps offering fixes without forcing you to care.

---

## Implementation Specification

### Component 1: Post-Commit Hook

**Location**: `.git/hooks/post-commit`

**Responsibilities**:

1. Detect which files were in the commit
2. Run lint on each file
3. If errors exist → generate fix prompt
4. Copy prompt to clipboard
5. Save prompt to `.fix/`
6. Optional: desktop notification

**Critical**: This hook **never blocks**. It runs after commit completes.

**Deliverable**:

```bash
#!/bin/bash
# .git/hooks/post-commit

# Get files in the commit
FILES=$(git diff-tree --no-commit-id --name-only -r HEAD)

for FILE in $FILES; do
  # Check if file has lint errors
  if eslint --format json "$FILE" 2>&1 | grep -q '"errorCount":[1-9]'; then
    # Generate fix prompt
    lint-fix-generate "$FILE"

    # Notify (non-blocking)
    notify-send "Lint fix prompt ready" "$FILE" &
  fi
done

exit 0  # Always succeed
```

---

### Component 2: Prompt Generator

**Command**: `lint-fix-generate <file>`

**Responsibilities**:

1. Parse lint errors for file
2. Extract relevant code context
3. Generate structured prompt
4. Save to `.fix/<file>.md`
5. Copy to clipboard
6. Exit immediately (never wait)

**Prompt Template**:

````markdown
# Lint Fix Request

## File

`packages/ui/input/src/lib/crossword-grid.ts`

## Recent Commit

Commit abc1234: "feat: add crossword validation"

## Lint Errors

1. Line 77: Missing return type (@typescript-eslint/explicit-function-return-type)
2. Line 219: Lonely if statement (no-lonely-if)
3. Line 439: Unexpected console statement (no-console)
4. Line 440: Invalid template literal type (restrict-template-expressions)

## Task

Generate a unified diff that resolves these 4 lint errors.

## Constraints

- Do NOT modify the recent business logic changes
- Do NOT change behavior
- Output unified diff ONLY

## Output Format

```diff
diff --git a/... b/...
...
```
````

````

**Deliverable**: CLI tool that runs instantly (<100ms)

---

### Component 3: Clipboard Daemon

**Name**: `lint-fix-daemon`

**Responsibilities**:
1. Watch clipboard for unified diff patterns
2. Validate diff references a file in `.fix/`
3. Verify `git apply --check` succeeds
4. Create branch: `lint-fix/<file>-<timestamp>`
5. Apply patch
6. Run lint → verify errors resolved
7. Commit with structured message
8. Push branch
9. Open PR via `gh pr create`

**Critical Behavior**:
- Runs continuously in background
- Only acts on diffs that match pending `.fix/` files
- Never touches files that aren't in `.fix/` queue
- All operations are atomic and reversible

**Deliverable**: Rust daemon with:
```toml
# ~/.config/lint-fix/config.toml
[daemon]
enabled = true
check_interval_ms = 1000

[validation]
require_fix_file = true  # Only process diffs for files in .fix/
run_lint_after = true
reject_on_lint_failure = true

[pr]
template = ".github/LINT_FIX_PR_TEMPLATE.md"
auto_assign = false
labels = ["lint-fix", "automated"]
````

---

### Component 4: PR Template

**Location**: `.github/LINT_FIX_PR_TEMPLATE.md`

```markdown
## Automated Lint Fixes

This PR contains automated lint fixes for files recently committed with lint errors.

### Files Changed

- `packages/ui/input/src/lib/crossword-grid.ts`

### Errors Resolved

- Missing return types (2)
- Lonely if statements (1)
- Console statements (1)

### Validation

- ✓ All lint errors resolved
- ✓ No behavior changes
- ✓ Tests pass

### Review Notes

These fixes were generated by an LLM and automatically applied.
Please review to ensure no unintended changes.

**You can safely ignore/close this PR if you don't want these fixes.**
```

---

## Example End-to-End Flow

### Day 1, 10:00 AM - You Implement Feature

```bash
$ vim crossword-grid.ts
# ... implement validation logic ...

$ git add crossword-grid.ts
$ git commit -m "feat: add crossword validation"
[main abc1234] feat: add crossword validation

# ✓ You're done. Feature is in main.
# ✓ You move on to next task immediately.
```

### Day 1, 10:00:05 AM - Post-Commit Hook (Background)

```bash
# (You don't see this)
🔍 crossword-grid.ts has 4 lint errors
📝 Generated .fix/crossword-grid.ts.md
📋 Copied to clipboard
```

### Day 1, 2:00 PM - You Notice Prompt

```bash
# You're switching tasks, notice notification
# Or you check clipboard
# Or you just browse .fix/ directory

# You paste to ChatGPT (10 sec)
# You copy diff (5 sec)
```

### Day 1, 2:01 PM - Daemon Creates PR

```bash
🤖 Detected diff for crossword-grid.ts
✓ Created branch lint-fix/crossword-grid-ts-20260115
✓ Applied fixes
✓ Opened PR #456
```

### Day 3 - You Review PR

```bash
$ gh pr list
#456  Lint fixes for crossword-grid.ts

$ gh pr diff 456
# Looks good

$ gh pr merge 456
✓ Merged
✓ crossword-grid.ts is now clean
```

### Alternative Timeline - You Ignore PR

```bash
# PR #456 sits there forever
# File still has lint errors
# Totally fine

# Week later, you edit the file again
$ vim crossword-grid.ts
# ... implement another feature ...
$ git commit -m "feat: add crossword hints"

# Post-commit hook fires AGAIN
📝 Generated new prompt (file still has errors)
🤖 Eventually creates PR #512
# Cycle repeats
```

**You never think about lints in either timeline.**

---

## Safety & Edge Cases

### What If You Ignore All Lint Fix PRs?

**Answer**: That's fine. The system keeps trying, but never forces you.

```
Commit 1 → PR #456 (ignored)
Commit 2 → PR #512 (ignored)
Commit 3 → PR #578 (ignored)
...
Commit N → PR #999 (finally merged)
```

**Or all ignored forever. Also fine.**

### What If LLM Generates Bad Diff?

**Answer**: PR fails CI, you close it, no harm.

```
🤖 Created PR #456
❌ CI failed (lint errors still present)
# You close PR, move on
# Next commit → tries again
```

### What If Daemon Applies Wrong Diff?

**Answer**: Can't happen—validation ensures diff matches `.fix/` file.

```
Clipboard: diff for random-file.ts
Daemon: "No .fix/random-file.ts.md found, ignoring"
```

### What If Multiple Commits Before Paste?

**Answer**: Last commit wins, old prompts go stale.

```
Commit A to file.ts → .fix/file.ts.md (v1)
Commit B to file.ts → .fix/file.ts.md (v2, overwrites)
# You paste v2, that's the current state
```

---

## Success Criteria

### Primary Goal (Non-Negotiable)

**Time spent reasoning about lints: 0 seconds**

You never:

- Think "should I fix lints?"
- Wait for lint fixes
- Decide fix vs skip
- Block on lint resolution

### Secondary Goals

- Business logic commits: never blocked
- Lint fix PRs: always available, never required
- Debt reduction: passive, over time
- Developer flow: completely uninterrupted

### Acceptable Outcomes

- ✅ You ignore 50% of lint fix PRs
- ✅ Some files never get clean
- ✅ PRs sit open for weeks
- ✅ Multiple PRs for same file

**All of this is fine as long as you never reason about lints.**

---

## What This Is NOT

### Not Enforced Cleanup

- ❌ No "you must fix lints before committing"
- ❌ No CI blocking on lint errors
- ❌ No pre-commit hooks that pause

### Not Active Workflow

- ❌ No commands you run
- ❌ No decisions you make
- ❌ No tasks you manage

### Not Immediate

- ❌ No same-commit lint fixes
- ❌ No waiting for LLM
- ❌ No real-time interaction

**This is entirely passive and asynchronous.**

---

## Implementation Timeline

### Week 1: Post-Commit Hook + Prompt Generation

- Git post-commit hook
- Lint error detection
- Prompt generation
- Clipboard integration
- Desktop notifications

### Week 2: Daemon + Diff Application

- Clipboard monitoring daemon
- Diff validation
- Branch creation
- Patch application
- PR creation via `gh`

### Week 3: Safety + Edge Cases

- Multi-file handling
- Stale prompt detection
- Conflict resolution
- Error recovery

### Week 4: Polish + Dogfooding

- Configuration options
- Logging
- Monitoring
- Real-world testing

---

## Technical Architecture

### Data Flow

```
Post-Commit Hook          Clipboard Daemon
       │                         │
       ├─ Detect lint            │
       ├─ Generate prompt        │
       ├─ Save to .fix/          │
       └─ Copy to clipboard      │
                                 │
       [Human pastes/copies]     │
                                 │
                                 ├─ Detect diff
                                 ├─ Validate
                                 ├─ Create branch
                                 ├─ Apply patch
                                 ├─ Verify lint
                                 └─ Open PR
                                        │
                                   [Human reviews]
                                        │
                                   [Merge or ignore]
```

### State Management

```
.fix/
  ├── crossword-grid.ts.md          # Pending prompt
  ├── another-file.ts.md            # Pending prompt
  └── processed/
      └── old-file.ts.md            # Archive after PR created

~/.config/lint-fix/
  ├── config.toml                   # Daemon config
  └── state.json                    # Active PRs, etc.
```

### PR Naming Convention

```
Branch: lint-fix/<filename>-<timestamp>
PR Title: "Lint fixes for <filename>"
Commit: "fix(lint): resolve N issues in <filename>"
```

---

## Why This Works

### Psychological

- You never "decide to fix lint"
- You never "stop feature work"
- You never "wait for anything"
- Lint fixes are background noise

### Economic

- Only fix files you actively develop
- Ignore dead code automatically
- Zero time cost (paste/copy is async)

### Sustainable

- No cleanup pressure
- No mounting guilt
- No "lint debt crisis"
- System runs forever without attention

---

## Summary

**This workflow has one job: ensure you never think about lints.**

Your commits succeed immediately.  
Your features land immediately.  
Your flow never breaks.

Lint fix PRs appear in the background—review them when you want, ignore them forever if you want.

**The cycle:**

1. Commit business logic (never blocked)
2. Prompt appears (when you notice)
3. Paste/copy (15 seconds, async)
4. PR appears (when it's ready)
5. Review/merge/ignore (whenever, maybe)

**Time spent reasoning about lints: 0**

That's the only metric that matters.
