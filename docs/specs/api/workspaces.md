# Workspace REST Notes

`docs/specs/workspaces.md` owns workspace lifecycle and retention semantics.
`docs/specs/api/openapi.yaml` is the exact transport contract for
`GET /workspaces` and `POST /workspaces/cleanup`.

This file exists only as a routing note so workspace retention stays discoverable
from the API specs area without duplicating the canonical contract.
