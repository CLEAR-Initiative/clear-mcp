# Git flow

This repo is **trunk-based**: the default/integration branch is **`main`**.

- **featureBase** — `main`. Cut every ticket branch off `origin/main` and open its PR against `main`.
- **Promotion chain** — `feature → main`. Nothing sits between a merged PR and trunk.
- **deploy trigger** — none in V1. The server runs locally from source; there is nothing to deploy.
  When V1.1 publishes `@clear-initiative/mcp` to npm, a tagged release (`v*`) becomes the publish
  trigger; when V2 adds a hosted mode, `clear-infra` owns its deploy. Neither changes the branch model.

Squash-merge PRs so `main` stays one commit per ticket action-set; branch names are set on the
Exponential ticket (`branchName`) and are what `/start-ticket` checks out.

Skills (`/start-ticket`, `/ship-ticket`, `/setup-merge-hook`) read `featureBase` and the deploy
trigger from this file.
