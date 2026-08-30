# AGENTS.md

Owner: `hhaus-org`

Tracking:

- Linear: `https://linear.app/denman/project/githubcomhhaus-org-1270c3d9de52`
- GitHub Project: `https://github.com/orgs/hhaus-org/projects/1`

This is the canonical Astro marketing repository for `hhaus.org`. Preserve the separate page/folder structure, shared sticky header/footer, responsive layouts, accessible landmarks, and exact city-route allowlist.

Use Astro, not Jekyll, Hugo, React, or JSX. Add tests with behavior changes. Keep the sibling `hhaus-org-test/marketing-site-e2e` suite independent: it may consume a pinned source SHA and public deployment, but it must never mutate production, DNS, or Pages settings.

Never commit credentials or private resident data. Keep Cloudflare and GitHub credentials in approved helpers only. Resolve conflicts semantically using relevant history. Never rebase, stash, reset, force-push, or use a worktree without explicit human permission. Stage explicit paths, commit verified work, merge remote changes, push, and open a PR.

Do not broaden the city routing wildcard. `auth`, `org`, `user`, `api`, `admin`, `admin-api`, and the legacy-reserved `api-admin` are application hosts and must fail closed outside the seven-city redirect contract.
