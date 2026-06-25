# Exploratory Tests

This file records manual and semi-manual exploratory checks that are worth
turning into automated coverage.

## 2026-06-25 - 0.5.3 RC on .50

Target:

- URL: `http://192.168.88.50:3000`
- Runtime: Docker Swarm
- Deployed image: `hiveforge:local-0.5.3-rc-20260625-1858`
- Reported version: `0.5.3`

Scope:

- Operator UI route behavior.
- Deployment runtime visibility and diagnostics behavior.
- Activity data volume and pagination readiness.
- Release-candidate smoke checks after deploying the local 0.5.3 build to `.50`.

Checks run:

| Check | Method | Result |
|---|---|---|
| Health endpoint reports live service and version | `GET /health` | Passed: `status=ok`, `hiveforge.version=0.5.3`. |
| Public UI shell routes render HTML | `GET /`, `/ui`, `/ui/overview`, `/ui/deployments`, `/ui/actions`, `/ui/activity` | Passed: each route returned `200 text/html`. |
| API route remains authenticated | `GET /deployments` without token | Passed: returned `401 application/json`; the UI path work did not expose the REST API as public HTML. |
| UI bundle contains expected release sentinels | Inspected `/ui/app.js` | Passed: bundle includes `HIVEFORGE_INFO` version `0.5.3`, Activity pagination, deployment no-match copy, and startup/token paths calling `refreshUi()`. |
| Environment inventory is reachable with the service token | Authenticated API probe | Passed: current environment is `swarm`; runtime list includes `docker-swarm`. |
| Registered projects and refs are visible | Authenticated API probe | Passed: projects returned expected refs for `hivemind`, `pockethive`, `hiveforge-smoke-stack`, `hivewatch`, and `pockethive-development`. |
| Deployment inventory loads | Authenticated `GET /deployments` | Passed: 5 deployment records returned. |
| Runtime status is operator-first | Authenticated runtime-status probe per deployment | Passed: `pockethive-development/stack` reported `running`; historical or removed deployments reported `missing` with explicit reasons. |
| Running deployment diagnostics are available | Authenticated diagnostics probe for `pockethive-development/stack` | Passed: runtime `running`, analysis `ok`, compose artifact present, 0 findings. |
| Historical missing deployments are explainable | Runtime-status probe | Passed: missing records explain that no Docker containers or services matched required HiveForge labels, or that the deployment was recorded as removed. |
| Activity data source is non-empty | Authenticated operations/journal probe | Passed: operations returned `0`, journal returned `229`; Activity pagination is needed for real data volume. |

Observed deployment state:

- `pockethive-development/stack`: runtime `running`, 20 services, 5 containers,
  compose present, diagnostics `ok`.
- `hiveforge-smoke-stack/web`: recorded `deployed`, runtime `missing`; no
  matching Docker labels found.
- `hivemind/service`: recorded `deployed`, runtime `missing`; no matching Docker
  labels found.
- `hivewatch/service`: recorded `deployed`, runtime `missing`; no matching
  Docker labels found.
- `pockethive/service`: recorded `removed`, runtime `missing`; removed state is
  expected.

Automation candidates:

- Add an HTTP route/auth-boundary smoke test for `/ui/...` routes and
  authenticated REST paths.
- Add a browser test for deep links such as `/ui/deployments` and
  `/ui/activity`.
- Add an authenticated browser test that injects a known test token into
  `localStorage`, verifies deployment runtime rows, and confirms the page does
  not scroll back to the top during refresh.
- Add a deployment filter test proving that an empty filtered list shows the
  no-match detail panel instead of leaking a deployment outside the selected
  filter.
- Add an Activity pagination test with seeded journal entries above one page.
- Add an authenticated API smoke script for `.50`-style environments that checks
  health, environment runtime, deployments, runtime status, diagnostics, and
  journal volume without printing the auth token.

Gaps:

- No full authenticated Playwright click-through was completed in this pass.
  The API and bundle probes covered the release risk, but UI interaction should
  still be automated with a safe token-injection harness.
- No lifecycle action was executed from the UI during this pass.
- `.50` intentionally contains historical deployments that no longer have
  matching Docker labels, so `missing` runtime states are expected for those
  records.
