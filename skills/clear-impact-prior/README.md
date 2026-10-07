# Running the ImpactPrior Worker as a scheduled routine

The skill in this directory is the procedure; this file is the operational configuration
for the **web Worker** — a scheduled Claude Code routine draining `event.impact_prior.web`
Tasks — which lives with the deployment, not in code. Follow it once per environment.

clear-api fans one enrichment request out into one Task per source kind. Dagster drains
`event.impact_prior.clear` over CLEAR's own data; this routine drains `.web` and is the
Worker that can cite the web (clear-api #727). The two never touch each other's Tasks.

## 1. A Worker identity in clear-api

**One worker identity per Worker**, so a Task's `leaseOwner` names the source that worked
it: the Dagster `.clear` drain and this `.web` routine each run as their own `worker`
service user. On the clear-api host (or against its database), mint the routine's user and
its key with clear-api's `scripts/create-worker-user.ts`, overriding the defaults (which
belong to the generic/Dagster Worker):

```bash
WORKER_USER_EMAIL=routine-worker@clearinitiative.io \
WORKER_USER_NAME="CLEAR Worker (Claude routine)" \
bun run scripts/create-worker-user.ts            # prints a sk_live_… key ONCE

WORKER_USER_EMAIL=routine-worker@clearinitiative.io \
bun run scripts/create-worker-user.ts --new-key  # rotate later
```

The `worker` role reads content like any approved user and writes only Tasks it holds and
`proposed` ImpactPriors — enforced by clear-api for the key itself, not only by clear-mcp's
tools (ADR-0010; clear-api #192). Still keep the key out of anything the routine can print
or read back. Two runs of *this* routine in parallel are fine with its one identity because
every claim mints its own `leaseToken`; what must not be shared is one identity across
Workers of different kinds.

## 2. The routine's environment

Only a Worker process sets `CLEAR_MCP_WORKER`. Never put it in a plugin or extension setting.

| Variable | Value |
|---|---|
| `CLEAR_API_URL` | The target clear-api (dev first, then production) |
| `CLEAR_API_KEY` | The worker key from step 1 |
| `CLEAR_MCP_WORKER` | `1` |
| `CLEAR_MCP_LOCALE` | `en` (the skill writes English proposals) |
| `CLEAR_MCP_LOG_LEVEL` | `info` |

MCP server for the routine (any MCP client config; `npx` resolves the published version):

```json
{
  "mcpServers": {
    "clear": {
      "command": "npx",
      "args": ["-y", "@clear-initiative/mcp@0.4.0"],
      "env": {
        "CLEAR_API_URL": "https://<clear-api>",
        "CLEAR_API_KEY": "sk_live_…",
        "CLEAR_MCP_WORKER": "1"
      }
    }
  }
}
```

Install the skills with the Claude Code plugin (`.claude-plugin/`) or copy
`skills/clear-impact-prior/` into the routine's skills directory; the skill must be present
for the prompt below to resolve.

## 3. The schedule and the prompt

A cloud-scheduled Claude Code routine, **every 15 minutes**, with **web search enabled**
(the skill refuses to claim without it — the web is its only source) and this prompt:

> Run the `clear-impact-prior` skill once: claim at most one `event.impact_prior.web` Task
> from CLEAR and finish it from web sources only. If nothing is waiting, say so and stop.
> Report the Task id, the outcome (produced / no_prior_found / failed / cancelled) and the
> number of cases.

Sizing: a Task takes 5–12 minutes of research; the lease is 15 minutes and the skill
heartbeats every ~5. Two overlapping runs cannot collide on a Task — the lease token
prevents it — but keep the schedule at 15 minutes so one run normally finishes before the
next starts. The requester cap (`TASK_REQUEST_DAILY_CAP`, 20 a day per person) bounds the
queue; the platform-wide claim cap arrives in V3 once Dagster reports real cost.

## 4. Checks after the first run

- `clear_whoami` in the routine's transcript shows `workerEnabled: true` and role `worker`.
- The transcript's `clear_claim_tasks` call passes `kind: "event.impact_prior.web"`, and
  every `basis` entry of the proposal is `tier: "web"` with a `sourceUrl`.
- In clear-api, the Event's page shows the `.web` Task COMPLETED with `leaseOwner`
  `routine-worker@clearinitiative.io` and, with cases, a `proposed` ImpactPrior beside it
  whose `sourceKind` is `event.impact_prior.web` and `methodVersion` is
  `clear-impact-prior-web@0.2.0`; the `.clear` Task and its proposal, if any, sit next to it.
  `model` / `costUsd` stay empty on the Task: the routine cannot measure its own usage, so it
  does not report any (take spend from the routine's billing).
- A FAILED Task's `lastError` is readable by the requester; fix the cause before retrying by
  hand — the queue retries three times on its own.

## 5. Rolling back

Unset `CLEAR_MCP_WORKER` (or pause the schedule). Tasks already LEASED lapse after 15
minutes and return to the pool; nothing is lost, and the `.clear` Worker is unaffected. To
stop a compromised routine outright, revoke its key in clear-api (or deactivate the
`routine-worker@clearinitiative.io` user) — because the identity is the routine's own, that
revokes nothing else. The role cannot mint keys, so the key in this file is the only one to
revoke — unless you rotated with `--new-key` and left the old ones active.
