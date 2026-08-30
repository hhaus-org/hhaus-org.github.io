# H/HAUS

The Astro marketing site for the global H/HAUS hacker-house network and the canonical source for `hhaus.org`.

## Network

The root site introduces the shared model and publishes a canonical page for each planned or active chapter:

- Berlin — `/locations/berlin/`
- Medellín — `/locations/medellin/`
- Tokyo — `/locations/tokyo/`
- London — `/locations/london/`
- São Paulo — `/locations/sao-paulo/`
- CDMX — `/locations/cdmx/`
- Montréal — `/locations/montreal/`

Cloudflare city hosts redirect to these pages through the exact allowlist in [`config/city-routes.json`](config/city-routes.json). Reserved application hosts such as `auth`, `org`, `user`, and `api` are deliberately outside that routing contract.

## Development

Requires Node.js 22.12 or newer.

```bash
npm ci
npm run dev
npm run verify
```

The site is built with Astro only. It does not use Jekyll, Hugo, React, or JSX. GitHub Actions builds the static artifact and deploys it to GitHub Pages.

## Delivery surfaces

- Source: <https://github.com/hhaus-org/hhaus-org.github.io>
- GitHub Pages origin: <https://hhaus-org.github.io>
- Public domain: <https://hhaus.org>
- External acceptance: <https://github.com/hhaus-org-test/marketing-site-e2e>
- Linear project: <https://linear.app/denman/project/githubcomhhaus-org-1270c3d9de52>
- GitHub Project: <https://github.com/orgs/hhaus-org/projects/1>

Production completion requires separate evidence for the merged source SHA, Pages deployment, Cloudflare DNS, edge TLS, city redirects, and external acceptance. A local build or queued workflow is not sufficient.
