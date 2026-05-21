# HiveForge Interface Map

## Operator Rule

Users and AI agents operate HiveForge through MCP.

REST is for HiveForge maintainers developing or debugging HiveForge itself. It is
not a user-facing operator interface and is not a fallback path.

## Tasks

| Task | Interface |
|---|---|
| Prepare HiveForge install files | Docs + human review |
| Select known HiveForge target | `hf-target` CLI |
| Start AI tool connection | HiveForge MCP |
| Read HiveForge version | MCP |
| List environments | MCP |
| List projects | MCP |
| List deployments | MCP |
| Inspect candidate repository | MCP |
| Register project | MCP |
| Inspect registered project | MCP |
| Validate requirements | MCP |
| Start lifecycle action | MCP |
| Check operation status | MCP |
| Read audit journal | MCP |

## Non-Operator Surfaces

REST, direct TypeScript service calls, and local test fixtures are implementation
and maintainer surfaces. Do not give them to users as normal HiveForge usage.
