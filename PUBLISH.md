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
- `.github/workflows/ci.yml` — build + typecheck + vitest + gitleaks on push/PR.
- `.github/workflows/publish.yml` — `npm publish --provenance` on a GitHub Release (OIDC).
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

## 3 — Cut a release

```bash
# bump version in package.json (e.g. 0.1.0), then:
git tag v0.1.0 && git push origin v0.1.0
gh release create v0.1.0 --generate-notes
```

The release triggers `publish.yml`: it builds, typechecks, tests, verifies the tag matches
`package.json` version, then `npm publish --provenance --access public`.

Verify:

```bash
npm view @matihlabs/mcp version           # → 0.1.0
npm view @matihlabs/mcp dist.attestations # provenance present
```

## 4 — Keep public ↔ monorepo in sync

`tools/matih-mcp/` in the monorepo is the source of truth. On each SDK change, mirror the
package contents (NOT monorepo history) to the public repo and cut a release. Keep the
conformance test (`test/conformance.test.ts`) — it pins the SDK to the server's frozen manifest,
so a server tool/version change that isn't mirrored fails CI before publish.

## Local secret-scanning (optional but recommended)

```bash
pip install pre-commit && pre-commit install   # runs gitleaks before every commit
gitleaks detect --config .gitleaks.toml --no-banner
```
