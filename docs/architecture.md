# Marketing-site architecture

## Source and publication

`hhaus-org/hhaus-org.github.io` is the single source repository. Astro produces a static `dist/` artifact. GitHub Pages publishes the exact artifact from the protected deployment workflow; Cloudflare provides public DNS, TLS proxying, and exact-host city redirects.

The page metadata includes `hhaus-source-sha`. The Pages workflow sets it to the 40-character Git commit used for the build. External acceptance compares this marker with the SHA it was asked to certify.

## City routing

The root site owns canonical city paths under `/locations/`. Cloudflare may redirect only the seven hostnames declared in `config/city-routes.json`. A wildcard redirect is forbidden because the application hosts `auth`, `org`, `user`, `api`, `admin`, and `api-admin` have separate responsibilities.

The preferred city behavior is an HTTP 308 redirect to the canonical root path, preserving the query string. Unknown hosts fail closed. The marketing source does not carry Cloudflare credentials or deployment authority.

## Completion gates

1. Source checks and static tests pass.
2. The branch is reviewed and merged without rewriting shared history.
3. GitHub Pages deploys the exact merged SHA using the Astro workflow.
4. The Pages origin serves every route and exposes that SHA.
5. GitHub organization domain ownership is verified before serving DNS is added.
6. Apex, `www`, and the seven exact city hosts resolve with valid TLS and bounded redirects.
7. `hhaus-org-test/marketing-site-e2e` independently accepts that exact SHA.

No earlier gate implies a later one.
