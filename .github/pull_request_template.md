# Pull Request Template

## Description

Please include a summary of the changes and the related issue. Please also include relevant motivation and context.

## Superseded

What this change made obsolete (code, tests, docs) and removed, or "None" and why. If it adds
something existing code already does, name that code and say why both must exist.

## Change kind

`story` (the user story moved: behaviour added or retired) or `defect` (code failed in a state
its story already covered), as in every commit's `Change-Kind:` trailer. See `CLAUDE.md`,
"Two kinds of pull request".

For a defect, give:

- the promise it declares or amends: its ID and where it lives;
- its **Claim**;
- its **Family**, and the dimensions that generate it;
- its **Proof**, and how it reaches each dimension;
- any **Tolerance**;
- its relation to earlier promises: New, or Breaks, Widens or Shares with the earlier ID;
- which check could have caught the failure, and why none did.

## Type of Change

Please delete options that are not relevant.

- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] This change requires a documentation update

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published in downstream modules

## Screenshots

Please add any relevant screenshots for changes that affect the UI.
