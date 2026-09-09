# Opto Sync form connector

Pinned from the merged `opto-sync/opto-sync-clients` form-connector revision
`2c2718ac9cfd236e10d73968d3ddada748900f4f` (PR #120, DEN-313).

This directory is the package's dependency-free
`@opto-sync/client/forms/standalone` browser artifact. Update the module graph
as a unit from the TypeScript-generated standalone output in the upstream
repository. Do not patch one generated JavaScript file independently.

Upstream blob identities at the pinned merge revision:

- `types.js`: `a8d53d9c06e6f8f17c6fa5c03926a80eceef8055`
- `sanitize.js`: `538e34ed9695da640a5590e831bc644f867f1843`
- `browser-queue.js`: `95d7c1d3f8fe91f332ff0db394da4f352419f7f2`
- `connectors.js`: `f28ed44c96d659b7532857ab0d81180d46cc6978`
- `index.js`: `603f1ac2f3cd5c860cf0d368d438a9cfe78c0bb9`

`tests/opto-intake.test.mjs` recomputes each vendored module's Git blob SHA-1
and requires these exact identities, so a metadata-only pin change cannot pass.
