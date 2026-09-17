---
featureBase: main
deployTrigger: main
---

# Git flow

This repo is **trunk-based**: the default/integration branch is **`main`**.

- **featureBase** — `main`. Cut every ticket branch off `origin/main` and open its PR against `main`.
- **Promotion chain** — `feature → main`. Nothing sits between a merged PR and trunk.
- **deploy trigger** — `main`. Nothing is deployed in V1 (the server runs locally from source), so
  "deployed" here means "on trunk": a merge into `main` promotes the PR's ticket `QA → DONE` via
  `.github/workflows/exponential-promote.yml`.
- **release trigger** — a `v*` tag on a `main` commit. `.github/workflows/release.yml` publishes
  `@clear-initiative/mcp` to npm and attaches the Claude Desktop `.mcpb` to a GitHub Release
  (ADR-0008). Bump with `bun run set-version X.Y.Z` in an ordinary PR, merge, then tag the merge
  commit immediately — the plugin on `main` pins that npm version. When V2 adds a hosted mode,
  `clear-infra` owns its deploy. Neither changes the branch model or the promotion hook.

Squash-merge PRs so `main` stays one commit per ticket action-set; branch names are set on the
Exponential ticket (`branchName`) and are what `/start-ticket` checks out.

Skills (`/start-ticket`, `/ship-ticket`, `/setup-merge-hook`) read `featureBase` and the deploy
trigger from this file.
