#!/bin/bash
#
# Usage: ./scripts/release.sh <version>
#
#   version   major | minor | patch   stable release
#             prerelease              next prerelease of the current version,
#                                     keeping its identifier
#             X.Y.Z-<id>.N            explicit version, used to start a new
#                                     prerelease series
#
# The identifier of a prerelease version (e.g. "beta" in 5.8.0-beta.0) becomes
# the npm dist-tag the release workflow publishes under, so consumers opt in
# with `pnpm add @codspeed/core@beta` while `latest` keeps pointing at the last
# stable release.
#
#   ./scripts/release.sh patch          5.7.1        -> 5.7.2         (dist-tag latest)
#   ./scripts/release.sh 5.8.0-beta.0   5.7.1        -> 5.8.0-beta.0  (dist-tag beta)
#   ./scripts/release.sh prerelease     5.8.0-beta.0 -> 5.8.0-beta.1  (dist-tag beta)
set -ex

# Fail if not on main
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "Not on default branch"
  exit 1
fi

if [ $# -ne 1 ]; then
  echo "Usage: ./release.sh <major|minor|patch|prerelease|X.Y.Z-id.N>"
  exit 1
fi

# Fail if there are any unstaged changes left
git diff --exit-code

pnpm lerna version "$1" --force-publish --no-private --sign-git-tag
