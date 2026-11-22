#!/usr/bin/env bash
set -euo pipefail

# Bucket prune (.claude/skills/coordinate/SKILL.md, "Buckets"): once a bucket
# PR (head `claude/bucket-<repo>-<n>`) has squash-merged, delete the branches
# it carried. GitHub's delete-on-merge removes only the bucket's own branch;
# the worker branches merged into it with merge commits stay behind, and a
# cloud session cannot delete a branch (its push gets a 403). Run by
# .github/workflows/bucket-prune.yml.
#
# What goes. A carried commit is a non-first parent of a merge commit in the
# bucket (`git log --merges <main>..<head>`) that main did not already hold
# (a merge of main into the bucket carries nothing). A remote branch is the
# bucket's when its tip is not on main and it is a carried commit, an
# ancestor of one, or a descendant of one. Of those, a branch is deleted only
# if its tip is an ancestor of the bucket's head, so all its work reached
# main through the squash. One whose tip is not has moved on since the
# bucket took it: it is kept, and the summary says so.
#
# Never deleted, whatever the history says: the default branch, a protected
# branch (PROTECTED_BRANCHES, one name a line, from the API), `bot/*`,
# `changeset-release/*` and `claude/bucket-*` (another bucket, or this one,
# whose branch GitHub deletes itself).
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
  local base
  base=$(git merge-base "$main" "$head")

  local -a carried=()
  local parents first rest p
  while read -r parents; do
    read -r first rest <<<"$parents"
    : "$first"
    for p in $rest; do
      is_ancestor "$p" "$base" || carried+=("$p")
    done
  done < <(git log --merges --format=%P "$base..$head")
  [ "${#carried[@]}" -gt 0 ] || return 0

  local ref name tip why related reason
  while read -r ref tip; do
    name=${ref#"$refs"/}
    [ "$name" = HEAD ] && continue
    is_ancestor "$tip" "$base" && continue
    related=""
    for p in "${carried[@]}"; do
      if [ "$tip" = "$p" ]; then
        related="its tip is a commit the bucket merged"
      elif is_ancestor "$tip" "$p"; then
        related="the bucket merged a commit built on its tip"
      elif is_ancestor "$p" "$tip"; then
        related="its tip builds on a commit the bucket merged"
      else
        continue
      fi
      break
    done
    [ -n "$related" ] || continue
    if reason=$(never_deleted "$name"); then
      printf 'keep\t%s\t%s\t%s\n' "$name" "$tip" "$reason"
    elif ! is_ancestor "$tip" "$head"; then
      printf 'keep\t%s\t%s\t%s\n' "$name" "$tip" "it has moved on since the bucket took it"
    else
      printf 'delete\t%s\t%s\t%s\n' "$name" "$tip" "$related"
    fi
  done < <(git for-each-ref --format='%(refname) %(objectname)' "$refs")
}

run() {
  : "${GH_TOKEN:?}" "${GITHUB_REPOSITORY:?}" "${DEFAULT_BRANCH:?}" "${PR:?}"
  local summary=${GITHUB_STEP_SUMMARY:-/dev/stdout}
  case $PR in '' | *[!0-9]*) echo "::error::PR must be a pull request number, got '$PR'" >&2; exit 1 ;; esac

  local merged head_ref head_sha cross
  read -r merged head_ref head_sha cross < <(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR" \
    --jq '"\(.merged) \(.head.ref) \(.head.sha) \(.head.repo.full_name != .base.repo.full_name)"')
  if [ "$merged" != true ] || [ "$cross" != false ] || [[ $head_ref != claude/bucket-* ]]; then
    echo "::error::#$PR is not a merged bucket PR from this repository (merged=$merged, head=$head_ref)." >&2
    exit 1
  fi

  local auth
  auth="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"
  echo "::add-mask::$auth"
  git -c "http.https://github.com/.extraheader=$auth" fetch --quiet origin \
    "+refs/pull/$PR/head:refs/bucket-prune/head" \
    "+refs/heads/*:refs/remotes/origin/*" --prune
  if [ "$(git rev-parse refs/bucket-prune/head)" != "$head_sha" ]; then
    echo "::error::refs/pull/$PR/head is not $head_sha, the PR's head." >&2
    exit 1
  fi

  PROTECTED_BRANCHES=$(gh api --paginate "repos/$GITHUB_REPOSITORY/branches?protected=true" --jq '.[].name')
  export PROTECTED_BRANCHES

  local planned
  planned=$(plan "$head_sha" "refs/remotes/origin/$DEFAULT_BRANCH")

  local failed=0 action name tip why
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
      if git -c "http.https://github.com/.extraheader=$auth" push --quiet \
        "--force-with-lease=refs/heads/$name:$tip" origin ":refs/heads/$name"; then
        echo "- deleted \`$name\` (${tip:0:7}): $why" >>"$summary"
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
