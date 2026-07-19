# Release Workflow

ShogiHome releases are driven entirely by the `Release`
GitHub Actions workflow (`.github/workflows/release.yml`). A maintainer no
longer runs `npm run release:*` locally to create the release commit and tag;
instead the workflow runs the quality gate and a build check first, creates a
release PR, and only after the maintainer reviews and merges the PR are
installers built and the draft release published.

## Triggering a release

Run the **Release** workflow from the Actions tab
(`workflow_dispatch`) on the branch you want to release from (usually `main`,
or a `support-*` branch). Two inputs are available:

- `release_type` — the kind of version bump (see the table below).
- `dry_run` — when `true`, the workflow runs the quality gate, the build check
  and the version bump, but does **not** push anything and does **not** create
  a PR or build installers. Use it to validate a release candidate.

## Release types

`release_type` maps to `npm version` arguments. Whether the new version is a
pre-release is detected from `package.json` afterwards, and the website assets
(`docs/release.json`, the generated docs HTML, and the webapp bundle) are only
updated for final (non-pre-release) versions. Pre-releases publish a tag only,
matching the previous local behavior of `release:alpha` / `release:beta` /
`release:pre`.

| `release_type`    | Example                           | `npm version`             | Website update |
| ----------------- | --------------------------------- | ------------------------- | -------------- |
| `minor`           | `1.1.0` → `1.2.0`                 | `minor`                   | yes            |
| `patch`           | `1.1.0` → `1.1.1`                 | `patch`                   | yes            |
| `major`           | `1.1.0` → `2.0.0`                 | `major`                   | yes            |
| `preminor-alpha`  | `1.1.0` → `1.2.0-alpha.0`         | `preminor --preid alpha`  | no (tag only)  |
| `preminor-beta`   | `1.1.0` → `1.2.0-beta.0`          | `preminor --preid beta`   | no (tag only)  |
| `prerelease`      | `1.1.0-alpha.0` → `1.1.0-alpha.1` | `prerelease`              | no (tag only)  |
| `prerelease-beta` | `1.1.0-alpha.0` → `1.1.0-beta.0`  | `prerelease --preid beta` | no (tag only)  |
| `finalize`        | `1.1.0-alpha.0` → `1.1.0`         | `patch`                   | yes            |

The mapping lives in `scripts/ci-release.ts`
(`releaseTypeToVersionArgs`).

## Workflow phases

The workflow runs three jobs in sequence:

1. **prepare** (`ubuntu-latest`)
   1. Quality gate mirroring `test.yml`: `verify-lockfile`, `npm ci`, `lint`,
      `docs` + `git diff --exit-code`, `license`, `coverage`.
   2. Build gate: `npm run electron:pack` (compiles web + electron
      main/preload/background).
   3. `npm run release:ci -- <release_type>` — runs `scripts/ci-release.ts`,
      which validates the release type against the current version, commits the
      license report, bumps the version with `npm version --no-git-tag-version`
      and commits it, for final versions runs `publish-release`, `docs`, and
      `release` to update the website assets and create the `release` commit,
      and finally creates the annotated `v<version>` tag on the last commit so
      the tag includes every release asset.
   4. Unless `dry_run`:
      - Creates a `release/v<version>` branch (isolated from `main`) and pushes
        it together with the tag in a single atomic push (`git push --atomic`),
        so a partial failure cannot leave the branch without its tag
      - **Creates a PR** against `main` for review of the generated assets
   5. **Nothing is pushed to `main` before this point**, so a failing test or
      build aborts the release with no branch/tag created.

2. **build** (matrix: win/mac/linux installers + win portable) — checks out the
   tag and produces the platform installers as artifacts. Runs even before the
   PR is merged (on the tag, which is stable).

3. **release** — downloads the artifacts and creates a **draft** GitHub Release
   for the tag. The draft is left for manual review/publishing.

`build` and `release` are skipped on `dry_run`.

## After the workflow completes

1. Review the release PR: check the generated assets (`docs/release.json`,
   webapp build, etc.)
2. Merge the PR into `main` when satisfied.
3. If desired, publish the draft release from the GitHub Releases page (or let
   it sit as a draft for further review).

## Why one workflow instead of a tag-push trigger

A tag pushed with the default `GITHUB_TOKEN` does **not** trigger other
workflows (GitHub's protection against recursive Actions runs). Keeping the
installer build in a separate `on: push: tags` workflow would therefore never
fire for CI-created tags. Consolidating everything into a single
`workflow_dispatch` run with job dependencies (`needs`) avoids this and keeps
the whole release in one place.

## Prerequisites / notes

- The `prepare` job creates and pushes a `release/v<version>` branch and
  creates a PR. The branch protection rules for `main` are **not** bypassed —
  the PR merge still requires branch protection checks to pass.
- The tag points at the final commit of the release branch: the `release`
  commit (webapp bundle + `release.json`) for final versions, or the version
  bump commit for pre-releases. Installer builds check out the tag, so they
  always build from the complete release state.
- The draft release is created pointing at this tag, but is not automatically
  published. The maintainer can review and publish it from GitHub, or keep it
  as a draft.
- The local `npm run release:*` scripts are retained for manual/offline use.
  `scripts/publish-release.ts` now also accepts `--yes` and
  `--platforms=all|win,mac,linux` for non-interactive runs.
