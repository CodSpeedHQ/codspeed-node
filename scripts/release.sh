#!/bin/bash
# Usage: ./scripts/release.sh <major|minor|patch>
set -ex

# Fail if not on main
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "Not on default branch"
  exit 1
fi

if [ $# -ne 1 ]; then
  echo "Usage: ./release.sh <major|minor|patch>"
  exit 1
fi

# Fail if there are any unstaged changes left
git diff --exit-code

pnpm lerna version $1 --force-publish --no-private
