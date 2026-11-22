#!/usr/bin/env bash
set -euo pipefail
shopt -s inherit_errexit

# Bucket prune (.claude/skills/coordinate/SKILL.md, "Buckets"): once a bucket
# PR (head `claude/bucket-<repo>-<n>`) has merged, delete the branches
# it carried. GitHub's delete-on-merge removes only the bucket's own branch;
# the worker branches merged into it with merge commits stay behind, and a
# cloud session cannot delete a branch (its push gets a 403). Run by
# .github/workflows/bucket-prune.yml.
#
# What goes. A carried commit is a non-first parent of a merge commit in the
# bucket (`git log --merges <main>..<head>`) that main did not already hold
# (a merge of main into the bucket carries nothing); it only names why a
# branch goes. A remote branch whose tip is not on main and is an ancestor of
# the bucket's head is deleted: all its work reached main through the
# merge. That covers a branch the bucket merged, one it was started from,
# an older point of either, and a branch made at a bucket commit with no
# work of its own yet. A branch that shares bucket work with the head but
# whose tip is not in it has moved on since the bucket took it: it is kept,
# and the summary says so.
#
# Never deleted, whatever the history says: the default branch, a protected
# branch (PROTECTED_BRANCHES, one name a line, from the API), `bot/*`,
# `changeset-release/*`, `claude/bucket-*` (another bucket, or this one,
# whose branch GitHub deletes itself), and the head or base of an open pull
# request (OPEN_PR_BRANCHES), since deleting it would close that PR.
# A branch a ruleset protects is not listed; its delete is refused and the
# run goes red, naming it.
#
# "Main" throughout is <main-rev>: main just before the bucket merged (the
# first parent of the PR's merge_commit_sha, after a squash or a merge
# commit; after a rebase, the commit before the last rewritten one, which
# holds none of the bucket's own commits either). Main as it is now will
# not do: after a merge commit it holds the whole bucket, and every carried
# branch would read as already on main.
#
# Usage:
#   scripts/bucket-prune.sh plan <head-sha> <main-rev>
#       prints one line per branch of the bucket's, tab-separated:
#       delete|keep, branch, tip, reason. Reads branches from
#       $BRANCH_REFS (default refs/remotes/origin) and changes nothing.
#   scripts/bucket-prune.sh run
#       the workflow's step: resolves $PR, plans, deletes each planned
#       branch only if its tip has not moved since the plan
#       (--force-with-lease), and writes $GITHUB_STEP_SUMMARY. Needs
#       GH_TOKEN, GITHUB_REPOSITORY, DEFAULT_BRANCH, PR.

is_ancestor() { git merge-base --is-ancestor "$1" "$2"; }

never_deleted() {
  local name=$1
  [ "$name" = "${DEFAULT_BRANCH:-main}" ] && { echo "the default branch"; return 0; }
  case $name in
    bot/* | changeset-release/*) echo "a bot's branch"; return 0 ;;
    claude/bucket-*) echo "a bucket's branch"; return 0 ;;
  esac
  if [ -n "${PROTECTED_BRANCHES:-}" ] && grep -qxF -- "$name" <<<"$PROTECTED_BRANCHES"; then
    echo "a protected branch"
    return 0
  fi
  return 1
}

plan() {
  local head=$1 main=$2 refs=${BRANCH_REFS:-refs/remotes/origin}
  local base merges branches
  base=$(git merge-base "$main" "$head") || {
    echo "no merge base of $main and $head" >&2
    return 1
  }
  # Read before looping, so a failing git fails the plan rather than reading
  # as an empty history.
  merges=$(git log --merges --format=%P "$base..$head")
  branches=$(git for-each-ref --format='%(refname) %(objectname)' "$refs")

  local -a carried=()
  local parents first rest p
  while read -r parents; do
    [ -n "$parents" ] || continue
    read -r first rest <<<"$parents"
    : "$first"
    for p in $rest; do
      is_ancestor "$p" "$base" || carried+=("$p")
    done
  done <<<"$merges"

  local ref name tip why reason shared
  while read -r ref tip; do
    [ -n "$ref" ] || continue
    name=${ref#"$refs"/}
    [ "$name" = HEAD ] && continue
    is_ancestor "$tip" "$base" && continue
    if is_ancestor "$tip" "$head"; then
      # Its whole history is in the bucket, so main holds it through the merge.
      why="the bucket holds its tip"
      for p in "${carried[@]}"; do
        [ "$tip" = "$p" ] && why="its tip is a commit the bucket merged"
      done
      if reason=$(never_deleted "$name"); then
        printf 'keep\t%s\t%s\t%s\n' "$name" "$tip" "$reason"
      elif [ -n "${OPEN_PR_BRANCHES:-}" ] && grep -qxF -- "$name" <<<"$OPEN_PR_BRANCHES"; then
        printf 'keep\t%s\t%s\t%s\n' "$name" "$tip" "an open pull request uses it"
      else
        printf 'delete\t%s\t%s\t%s\n' "$name" "$tip" "$why"
      fi
      continue
    fi
    # Not in the bucket: named only if it shares work the bucket took.
    shared=$(git merge-base "$tip" "$head") || continue
    # The default branch, bots' and buckets' branches go unnamed: they
    # move on by design (main itself, once it holds the merge).
    never_deleted "$name" >/dev/null && continue
    if ! is_ancestor "$shared" "$base"; then
      printf 'keep\t%s\t%s\t%s\n' "$name" "$tip" "it has moved on since the bucket took it"
    fi
  done <<<"$branches"
}

run() {
  : "${GH_TOKEN:?}" "${GITHUB_REPOSITORY:?}" "${DEFAULT_BRANCH:?}" "${PR:?}"
  local summary=${GITHUB_STEP_SUMMARY:-/dev/stdout}
  case $PR in '' | *[!0-9]*) echo "::error::PR must be a pull request number, got '$PR'" >&2; exit 1 ;; esac

  local merged head_ref head_sha cross merge_sha
  read -r merged head_ref head_sha cross merge_sha < <(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR" \
    --jq '"\(.merged) \(.head.ref) \(.head.sha) \(.head.repo.full_name != .base.repo.full_name) \(.merge_commit_sha)"')
  if [ "$merged" != true ] || [ "$cross" != false ] || [[ $head_ref != claude/bucket-* ]]; then
    echo "::error::#$PR is not a merged bucket PR from this repository (merged=$merged, head=$head_ref)." >&2
    exit 1
  fi

  local basic
  basic=$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)
  echo "::add-mask::$basic"
  # Through the environment, not git's argv, where other processes see it.
  export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.https://github.com/.extraheader
  export GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $basic"
  git fetch --quiet origin \
    "+refs/pull/$PR/head:refs/bucket-prune/head" \
    "+refs/heads/*:refs/remotes/origin/*" --prune
  if [ "$(git rev-parse refs/bucket-prune/head)" != "$head_sha" ]; then
    echo "::error::refs/pull/$PR/head is not $head_sha, the PR's head." >&2
    exit 1
  fi

  PROTECTED_BRANCHES=$(gh api --paginate "repos/$GITHUB_REPOSITORY/branches?protected=true" --jq '.[].name')
  OPEN_PR_BRANCHES=$(gh api --paginate "repos/$GITHUB_REPOSITORY/pulls?state=open&per_page=100" \
    --jq '.[] | (.head.ref, .base.ref)' | sort -u)
  export PROTECTED_BRANCHES OPEN_PR_BRANCHES

  # A git error in the plan fails this step (errexit, inherited into the
  # substitution), as it fails `plan` run on its own.
  local planned
  if ! is_ancestor "$merge_sha" "refs/remotes/origin/$DEFAULT_BRANCH"; then
    echo "::error::#$PR's merge commit $merge_sha is not on $DEFAULT_BRANCH." >&2
    exit 1
  fi
  planned=$(plan "$head_sha" "$merge_sha^1")

  local failed=0 action name tip why gone
  {
    echo "## Bucket prune: #$PR ($head_ref, ${head_sha:0:7})"
    echo
    if [ -z "$planned" ]; then
      echo "No branch the bucket carried is left."
    fi
  } >>"$summary"
  while IFS=$'\t' read -r action name tip why; do
    [ -n "$action" ] || continue
    if [ "$action" = delete ]; then
      if git push --quiet \
        "--force-with-lease=refs/heads/$name:$tip" origin ":refs/heads/$name"; then
        echo "- deleted \`$name\` (${tip:0:7}): $why" >>"$summary"
      elif gone=0 && { git ls-remote --exit-code --heads origin "refs/heads/$name" >/dev/null || gone=$?; } && [ "$gone" -eq 2 ]; then
        # Another prune (a bucket merged close behind this one) got it first.
        # Exit 2 is "no such ref"; any other failure of ls-remote is an error.
        echo "- \`$name\` (${tip:0:7}) was already gone" >>"$summary"
      else
        echo "- **not deleted** \`$name\` (${tip:0:7}): the push failed; see the log" >>"$summary"
        echo "::error::Could not delete $name" >&2
        failed=1
      fi
    else
      echo "- kept \`$name\` (${tip:0:7}): $why" >>"$summary"
    fi
  done <<<"$planned"
  exit "$failed"
}

case ${1:-} in
  plan)
    [ $# -eq 3 ] || { echo "usage: $0 plan <head-sha> <main-rev>" >&2; exit 2; }
    plan "$2" "$3"
    ;;
  run) run ;;
  *) echo "usage: $0 plan <head-sha> <main-rev> | run" >&2; exit 2 ;;
esac
