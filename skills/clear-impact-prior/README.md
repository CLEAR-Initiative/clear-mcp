# Running the ImpactPrior Worker as a scheduled routine

The skill in this directory is the procedure; this file is the operational configuration
for the first Worker — a scheduled Claude Code routine — which lives with the deployment,
not in code. Follow it once per environment.

## 1. A Worker identity in clear-api

On the clear-api host (or against its database), mint the `worker` service user and its key:

```bash
bun run scripts/create-worker-user.ts            # prints a sk_live_… key ONCE
bun run scripts/create-worker-user.ts --new-key  # rotate later
```

The `worker` role reads content like any approved user and writes only Tasks it holds and
`proposed` ImpactPriors — enforced by clear-api for the key itself, not only by clear-mcp's
tools (ADR-0010; clear-api #192). Still keep the key out of anything the routine can print
or read back. One identity per Worker deployment is the rule; two routines in parallel are
fine with one identity because every claim mints its own `leaseToken`.

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
      "args": ["-y", "@clear-initiative/mcp@0.3.0"],
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

A cloud-scheduled Claude Code routine, **every 15 minutes**, with web search enabled and this
prompt:

> Run the `clear-impact-prior` skill once: claim at most one `event.impact_prior` Task from
> CLEAR and finish it. If nothing is waiting, say so and stop. Report the Task id, the outcome
> (produced / no_prior_found / failed / cancelled) and the number of cases.

Sizing: a Task takes 5–12 minutes of research; the lease is 15 minutes and the skill
heartbeats every ~5. Two overlapping runs cannot collide on a Task — the lease token
prevents it — but keep the schedule at 15 minutes so one run normally finishes before the
next starts. The requester cap (`TASK_REQUEST_DAILY_CAP`, 20 a day per person) bounds the
queue; the platform-wide claim cap arrives in V3 once Dagster reports real cost.

## 4. Checks after the first run

- `clear_whoami` in the routine's transcript shows `workerEnabled: true` and role `worker`.
- In clear-api, the Event's page shows the Task COMPLETED and, with cases, a `proposed`
  ImpactPrior beside it. `model` / `costUsd` stay empty on the Task: the routine cannot
  measure its own usage, so it does not report any (take spend from the routine's billing).
- A FAILED Task's `lastError` is readable by the requester; fix the cause before retrying by
  hand — the queue retries three times on its own.

## 5. Rolling back

Unset `CLEAR_MCP_WORKER` (or pause the schedule). Tasks already LEASED lapse after 15
minutes and return to the pool; nothing is lost. To stop a compromised routine outright,
revoke its key in clear-api (or deactivate the worker user). The role cannot mint keys,
so the key in this file is the only one to revoke — unless you rotated with `--new-key`
and left the old ones active.
