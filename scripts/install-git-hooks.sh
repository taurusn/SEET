#!/usr/bin/env bash
# Install project git hooks as symlinks into .git/hooks/.
# Run once after cloning.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_DIR="$REPO_ROOT/.git/hooks"
SRC_DIR="$REPO_ROOT/scripts/git-hooks"

mkdir -p "$HOOK_DIR"
for hook in "$SRC_DIR"/*; do
    name="$(basename "$hook")"
    chmod +x "$hook"
    ln -sf "../../scripts/git-hooks/$name" "$HOOK_DIR/$name"
    echo "Installed hook: $name"
done
