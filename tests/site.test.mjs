import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
const htmlPath = (route) => {
  if (route === '/') return 'dist/index.html';
  if (route === '/404/') return 'dist/404.html';
  return `dist${route}index.html`;
};
const readRoute = (route) => read(htmlPath(route));

const cities = [
  ['berlin', 'Berlin'],
  ['medellin', 'Medellín'],
  ['tokyo', 'Tokyo'],
  ['london', 'London'],
  ['sao-paulo', 'São Paulo'],
  ['cdmx', 'CDMX'],
  ['montreal', 'Montréal'],
];

const routes = ['/', '/locations/', '/about/', '/apply/', '/404/', ...cities.map(([slug]) => `/locations/${slug}/`)];

test('Astro emits every public route with the shared site shell', () => {
  for (const route of routes) {
    const html = readRoute(route);
    assert.match(html, /<meta name="generator" content="Astro v[^"]+">/);
    assert.match(html, /aria-label="H\/HAUS home"/);
    assert.match(html, /class="site-footer"/);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/hhaus\.org\//);
    assert.match(html, /<meta property="og:image" content="https:\/\/hhaus\.org\/og\.png">/);
    assert.doesNotMatch(html, /Jekyll|Hugo|<title>Astro<\/title>|<h1>Astro<\/h1>/i);
  }
});

test('the root page names and links all seven exact city routes', () => {
  const html = readRoute('/');
  for (const [slug, name] of cities) {
    assert.match(html, new RegExp(`href="/locations/${slug}/"`));
    assert.ok(html.includes(name), `missing visible city name: ${name}`);
  }
  assert.match(html, /href="https:\/\/github\.com\/hhaus-org"/);
  assert.match(html, /href="https:\/\/user\.hhaus\.org"/);
  assert.match(html, /href="https:\/\/org\.hhaus\.org"/);
});

test('all internal links in built pages resolve to a static artifact', () => {
  for (const route of routes) {
    const html = readRoute(route);
    const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1]);
    for (const href of hrefs) {
      const pathname = href.split(/[?#]/, 1)[0];
      if (pathname === '/og.png') continue;
      const target = pathname.endsWith('/') ? htmlPath(pathname) : `dist${pathname}`;
      assert.ok(existsSync(join(root, target)), `${route} links to missing ${href}`);
    }
  }
});

test('city redirect contract is exact and excludes reserved application hosts', () => {
  const contract = JSON.parse(read('config/city-routes.json'));
  assert.equal(contract.redirect_status, 308);
  assert.equal(contract.unknown_host_policy, 'fail_closed');
  assert.equal(contract.cities.length, 7);
  assert.deepEqual(contract.cities.map(({ hostname }) => hostname), cities.map(([slug]) => `${slug}.hhaus.org`));
  const cityHosts = new Set(contract.cities.map(({ hostname }) => hostname));
  for (const hostname of contract.reserved_application_hosts) assert.equal(cityHosts.has(hostname), false);
});

test('social image, robots, sitemap, and non-Jekyll marker ship in the artifact', () => {
  const image = readFileSync(join(root, 'dist/og.png'));
  assert.equal(image.toString('ascii', 1, 4), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.ok(existsSync(join(root, 'dist/.nojekyll')));
  assert.match(read('dist/robots.txt'), /Sitemap: https:\/\/hhaus\.org\/sitemap-index\.xml/);
  assert.ok(existsSync(join(root, 'dist/sitemap-index.xml')));
  for (const forbidden of ['_config.yml', 'Gemfile', 'hugo.toml', 'hugo.yaml']) {
    assert.equal(existsSync(join(root, forbidden)), false, `${forbidden} must not exist`);
  }
});
