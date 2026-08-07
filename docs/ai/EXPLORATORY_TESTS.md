# Exploratory Tests

This file records manual and semi-manual exploratory checks that are worth
turning into automated coverage.

## 2026-08-07 - 0.5.5 Full Forgejo UAT on .50

Target:

- HiveForge: `http://192.168.88.50:3000`
- Forgejo Git and OCI endpoint: `http://192.168.88.50:3001/`
- Runtime: four-node Docker Swarm (`.50` through `.53`)
- HiveForge image:
  `192.168.88.54:5000/hiveforge:uat-0.5.5-full-e2e-20260807-1503`
  (`sha256:192b3461c9aaa24cf7b7808aaf0356d1162006da28eeb93e37bc97691107bf62`)

Scope:

- Full-node sibling Forgejo deployment.
- Runtime discovery of shared Git and OCI services, without a HiveForge
  endpoint variable or application-repository catalog.
- Actual Git → OCI → HiveForge deployment of an isolated HiveWatch UAT branch.

Checks run:

| Check | Result |
|---|---|
| HiveForge service | Passed: public `/health` reported `0.5.5`; the control-plane and action-runner image tags were aligned. |
| Forgejo service and storage | Passed: Forgejo `16.0` is pinned to `docker-swarm-mgr-1` (`.50`) with `/opt/hiveforge/forgejo` as node-local SQLite storage. `/v2/` returned `401` before authentication, which is the expected live registry response. |
| Service discovery | Passed: authenticated REST returned `configured`, Git base URL `http://192.168.88.50:3001/`, OCI address `192.168.88.50:3001`, and no application repository fields. |
| MCP | Passed: a real stdio MCP client listed `get_managed_repositories_info` and received the same structured result. |
| No duplicate endpoint config | Passed: the running HiveForge service has no managed Git/registry endpoint variable. Its only `HIVEFORGE_MANAGED_*` entry is the pre-existing managed-root bind source. |
| Docker insecure-registry setup | Passed manually on every `.50`–`.53` Docker daemon, followed by its normal Docker restart. MCP deliberately still reports the prerequisite as `manual-unverified`: it does not claim node-wide configuration from its own discovery. |
| Git push | Passed: isolated HiveWatch commit `88ca91f` was pushed to Forgejo branch `forgejo-full-uat`. |
| OCI push and cross-node pull | Passed: `192.168.88.50:3001/sepa/hivewatch-service:uat-88ca91f` was pushed with digest `sha256:db4e338c6ed3c4a10d999c846b4ec4c0b4be42e2f466bbb32a5e571eefb5ea5c`; a cold pull on `.53` returned that exact digest. |
| Internal Git manifest contract | Passed: `hiveforge.yaml` using the explicit private Forgejo HTTP Git URL registered as `hivewatch-development`. Arbitrary external HTTP Git remains contract-invalid. |
| Deploy prerequisites | Passed: registered ref, component/action, explicit environment policy, `docker-swarm` profile, runtime image value, and Swarm eligibility were all green. |
| HiveForge deploy | Passed: asynchronous operation `uiop-5fb7f642-4d52-4305-90bf-737eaa986dbf` completed successfully and recorded deployment `deployment-7074965a-6167-4ff9-8b6f-96995e6a5668` as `deployed`. |
| Runtime and service health | Passed: `hivewatch-forgejo-uat_hive-watch-service` and Postgres were `1/1`; the app was scheduled on `.52`, used the exact OCI digest, and `/actuator/health` returned `{"status":"UP"}`. |
| Diagnostics and recorded Compose | Passed: diagnostics summary was `ok` with zero findings; recorded Compose retained the Forgejo image reference and redacted password values. |

Finding and correction:

- The first trial stored Forgejo's SQLite `/data` on shared NFS. OCI layer
  uploads then stalled on slow SQLite commits. The service was stopped, its
  small data directory was copied without deleting the source, and it was
  redeployed on `.50` with node-local storage. The retry completed in seconds.
- The root manifest schema initially accepted only GitHub URLs even though the
  project registry accepted internal HTTP Git. The schema now shares the same
  explicit private-network boundary, with contract coverage for allowed and
  rejected URLs.

Boundary deliberately held:

- Full discovers and advertises shared services; it does not create or catalog
  application repositories, namespaces, users, credentials, image paths, or
  build results. The Forgejo user/repository and the HiveWatch UAT branch were
  created manually only to prove this UAT.
- This is isolated-lab HTTP, not TLS. Every Docker engine that pushes or pulls
  must be configured manually for the exact insecure registry address.
- The Forgejo deployment is one node with local SQLite, not HA. Its data needs
  a backup procedure appropriate to that node.

Automation candidates:

- Add a lab-only Git/OCI E2E script which bootstraps an ephemeral Forgejo user,
  pushes a tiny repository and image, verifies a pull on a second Swarm node,
  then revokes its tokens and removes the fixtures.
- Add an installer validation that rejects a Full Swarm configuration whose
  Forgejo data root is under the shared HiveForge managed root or a known NFS
  mount.

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
