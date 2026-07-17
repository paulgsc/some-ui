#!/bin/bash
set -euo pipefail

# Blocks Claude from creating, editing, or removing any .gitignore file in
# this repo (root or nested), regardless of instructions given later in the
# conversation. Changes to .gitignore must be made by a human.

input=$(cat)
tool_name=$(jq -r '.tool_name // empty' <<<"$input")

MSG='Blocked by project policy: .gitignore files must not be changed by Claude. If a change is needed, a human must edit .gitignore directly.'

deny() {
  jq -n --arg reason "$MSG" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

is_gitignore() {
  # $1 = file path (possibly empty/relative/absolute)
  [ -n "$1" ] && [ "$(basename -- "$1")" = ".gitignore" ]
}

case "$tool_name" in
  Edit|Write)
    file_path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
    is_gitignore "$file_path" && deny
    ;;
  NotebookEdit)
    file_path=$(jq -r '.tool_input.notebook_path // .tool_input.file_path // empty' <<<"$input")
    is_gitignore "$file_path" && deny
    ;;
  Bash)
    command=$(jq -r '.tool_input.command // empty' <<<"$input")
    # Evaluate line by line so an unrelated ">" or command word elsewhere in
    # a multi-line command (e.g. an email trailer in a commit message body)
    # can't combine with a same-string .gitignore mention to false-positive.
    while IFS= read -r line; do
      # Only look at lines that mention a .gitignore path at all.
      if grep -qE '(^|[^[:alnum:]_-])\.gitignore([^[:alnum:]_-]|$)' <<<"$line"; then
        # ...and where .gitignore is itself the target of a mutating idiom:
        # redirected into, or passed as an argument to an in-place-edit /
        # delete / move / copy / overwrite tool. Read-only commands like
        # `cat .gitignore`, `grep foo .gitignore`, `git check-ignore`, or
        # prose that merely mentions the filename (e.g. a commit message)
        # pass through.
        if grep -qE '>{1,2}[[:space:]]*[^[:space:]]*\.gitignore\b|\b(sed|perl)\b[^|&;]*-i[^|&;]*\.gitignore\b|\b(tee|rm|mv|cp|truncate|dd|awk|python[0-9.]*|node)\b[^|&;]*\.gitignore\b' <<<"$line"; then
          deny
        fi
      fi
    done <<<"$command"
    ;;
esac

exit 0
