# Opto Sync form connector

Pinned from `opto-sync/opto-sync-clients` commit
`1e4aae307563520d3a4595fbb57ade088a3f2f2e` (PR #120, DEN-313,
`@opto-sync/client` 0.5.0).

This directory is the package's dependency-free
`@opto-sync/client/forms/standalone` browser artifact. Update the module graph
as a unit from the TypeScript source in the upstream repository. Do not patch
one generated JavaScript file independently.

The final upstream head retains the previously reviewed queue, connector,
index, type, and package blobs. It advances `sanitize.js` to the baseline
`FormData.forEach()` implementation so conservative DOM library targets and
the deployed standalone artifact have the same sanitization semantics.

Upstream blob identities:

- `types.js`: `a8d53d9c06e6f8f17c6fa5c03926a80eceef8055`
- `sanitize.js`: `538e34ed9695da640a5590e831bc644f867f1843`
- `browser-queue.js`: `95d7c1d3f8fe91f332ff0db394da4f352419f7f2`
- `connectors.js`: `f6bdd3c6a48e36c55e6e2ac8d110df5635a7cdc8`
- `index.js`: `603f1ac2f3cd5c860cf0d368d438a9cfe78c0bb9`
- `package.json`: `089153bcb5adf57dc25f206a9dad3114c9cff80d`
