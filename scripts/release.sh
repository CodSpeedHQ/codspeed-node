#!/bin/bash
# Usage: ./scripts/release.sh <major|minor|patch|premajor|preminor|prepatch|prerelease> [preid]
set -ex

# Fail if not on main
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "Not on default branch"
  exit 1
fi

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "Usage: ./release.sh <major|minor|patch|premajor|preminor|prepatch|prerelease> [preid]"
  exit 1
fi

# lerna defaults the prerelease identifier to "alpha"; the dist-tag the release
# workflow publishes under is derived from it, so it must be spelled out for
# any other channel.
PREID=()
if [ $# -eq 2 ]; then
  if [[ ! "$2" =~ ^[a-z][a-z0-9-]*$ || "$2" == "latest" ]]; then
    echo "Invalid prerelease identifier: '$2' (expected e.g. alpha, beta, rc)"
    exit 1
  fi
  PREID=(--preid "$2")
fi

# Fail if there are any unstaged changes left
git diff --exit-code

pnpm lerna version "$1" "${PREID[@]}" --force-publish --no-private --sign-git-tag
