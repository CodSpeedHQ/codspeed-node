# Contributing

## Releasing a New Version

To create a new version, run:

```bash
./scripts/release.sh patch  # Increment PATCH component (e.g., 1.2.3 -> 1.2.4)
./scripts/release.sh minor  # Increment MINOR component (e.g., 1.2.3 -> 1.3.0)
./scripts/release.sh major  # Increment MAJOR component (e.g., 1.2.3 -> 2.0.0)
```

All packages share a single version, bumped in lockstep by `lerna version`.

### Prereleases

A new prerelease series is started by passing the version explicitly, and
continued with `prerelease`, which keeps the identifier it already has (the
label between the `-` and the counter):

```bash
./scripts/release.sh 5.8.0-beta.0  # 5.7.1        -> 5.8.0-beta.0
./scripts/release.sh prerelease    # 5.8.0-beta.0 -> 5.8.0-beta.1
```

The identifier becomes the npm dist-tag, so a prerelease is installed only by
asking for it:

```bash
pnpm add @codspeed/vitest-plugin@beta
```

`latest` keeps pointing at the most recent stable release, and `^5` never
resolves to a prerelease.

### What happens

1. **`scripts/release.sh`**:
   - Refuses to run outside `main` or with a dirty working tree
   - Runs `lerna version`, which bumps every package, commits, creates a signed
     `vX.Y.Z` tag and pushes it

2. **CI release workflow** (`.github/workflows/release.yml`):
   - Triggered automatically when the tag is pushed
   - Builds the native addon prebuilds for linux-arm and darwin-arm
   - Builds the libraries
   - Publishes to npm via OIDC trusted publishing, under the dist-tag derived
     from the tag's prerelease identifier (`latest` for a plain `vX.Y.Z` tag)
   - Creates a draft GitHub release, flagged as a prerelease when the version
     has a prerelease identifier
