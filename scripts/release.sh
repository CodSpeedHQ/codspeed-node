#!/bin/bash
# Usage: ./scripts/release.sh <major|minor|patch>
set -ex

if [ $# -ne 1 ]; then
  echo "Usage: ./release.sh <major|minor|patch>"
  exit 1
fi

# Fail if there are any unstaged changes left
git diff --exit-code

pnpm lerna version $1 -y
pnpm moon run :build
pnpm publish -r --access=public
NEW_VERSION=$(pnpm lerna list --json | jq -r '.[] | select(.name == "@codspeed/core") | .version')
gh release create v$NEW_VERSION --title "v$NEW_VERSION" --generate-notes -d