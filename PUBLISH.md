# Operator handoff — ship `@matihlabs/mcp` to OSS (matih-mcp Phase 3 / E)

The real SDK now lives here (v0.1.0). Phase 3 moves it to a **separate public repo** and
publishes **dist-only** with **provenance**. The code + CI/publish workflows + gitleaks config
are authored and travel with the package; the steps below are the OUTWARD-FACING actions that
need YOUR credentials (an agent must not run them).

> Scope: npm org **`@matihlabs`** (org `matihlabs`, owner `sushrut-matih`). Public repo
> **`github.com/matih-labs/matih-mcp`** (adjust if the name differs — also update `package.json`
> `repository.url`).

## What's already in the package (no action needed)

- `package.json` — `@matihlabs/mcp@0.1.0`, `files: ["dist","README.md","LICENSE"]` (dist-only
  tarball), `publishConfig.provenance: true`, `bin.matih-mcp` (the stdio bridge).
- `.github/workflows/ci.yml` — build + typecheck + vitest + gitleaks (license-free CLI) on push/PR.
- `.github/workflows/publish.yml` — **auto-publish on a version bump to `main`**: build +
  test + `npm publish --provenance` (OIDC trusted publishing) + tag `vX.Y.Z` + GitHub Release.
  Idempotent (no-ops if the version is already on npm). No manual `gh release create`.
- `.gitleaks.toml` + `.pre-commit-config.yaml` — secret scanning (CI + local).
- `LICENSE` (Apache-2.0), `README.md`, `LIFECYCLE.md` (deprecation + spec-migration policy).

## 1 — Create the public repo (dist-only published, source public)

```bash
# From a clean export of tools/matih-mcp/ (do NOT carry monorepo history):
git init && git add -A && git commit -m "chore: import @matihlabs/mcp v0.1.0"
gh repo create matih-labs/matih-mcp --public --source=. --push
```

The `.github/workflows/*` (inert in the monorepo) become active at the repo root. `dist/` is
gitignored and built in CI — the npm tarball ships `dist/` only (the `files` whitelist).

## 2 — Configure npm trusted publishing (OIDC, no token)

Preferred — no secret in the repo:

1. npmjs.com → `@matihlabs/mcp` → Settings → **Trusted Publishers** → add GitHub Actions:
   repo `matih-labs/matih-mcp`, workflow `publish.yml`.
2. Done — `publish.yml` authenticates via OIDC (`id-token: write`).

Fallback (if not using trusted publishing): create an **automation** `NPM_TOKEN`, add it as a
repo secret, and uncomment `NODE_AUTH_TOKEN` in `publish.yml`.

## 3 — Release (automated — just bump the version)

Publishing is automated by `publish.yml`. To cut a release you only **bump the version and
push to `main`** of the public repo:

```bash
# in the public repo working copy:
npm version patch --no-git-tag-version   # or edit "version" in package.json (+ sync lockfile)
git commit -am "release: vX.Y.Z" && git push origin main
```

On that push, `publish.yml` automatically: upgrades npm (≥ 11.5.1, required for tokenless
trusted publishing — node 20 ships 10.8), builds, typechecks, tests, `npm publish --provenance
--access public` via OIDC, then creates the `vX.Y.Z` git tag + GitHub Release. It is
**idempotent** — if `@matihlabs/mcp@<version>` is already on npm it no-ops, so non-version
pushes, re-runs, and re-syncs are safe (never "cannot publish over existing version"). A
manual run is available via the Actions tab or `gh workflow run publish.yml`.

> **Do not rename `publish.yml`** — the npmjs trusted-publisher OIDC subject pins the workflow
> filename. Renaming requires updating the trusted-publisher config on npmjs first.

Verify:

```bash
npm view @matihlabs/mcp version            # → X.Y.Z
npm view @matihlabs/mcp dist.attestations  # provenance present
gh run watch --repo matih-labs/matih-mcp   # the publish run
```

The legacy manual path (`gh release create vX.Y.Z`) still works if ever needed — the version
guard accepts it — but is no longer required.

## 4 — Keep public ↔ monorepo in sync

`tools/matih-mcp/` in the monorepo is the source of truth. On each SDK change, mirror the
package contents (NOT monorepo history) to the public repo `main` and bump the version — the
push auto-publishes (Step 3). Keep the conformance test (`test/conformance.test.ts`) — it pins
the SDK to the server's frozen manifest (vendored at `test/fixtures/mcp-manifest-frozen.json`;
a monorepo-only drift guard asserts the vendored copy matches `backend/src/test/resources/mcp/
mcp-manifest-frozen.json`), so a server tool/version change that isn't mirrored fails CI before
publish.

## Local secret-scanning (optional but recommended)

```bash
pip install pre-commit && pre-commit install   # runs gitleaks before every commit
gitleaks detect --config .gitleaks.toml --no-banner
```
