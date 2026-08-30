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

const routes = [
  '/',
  '/locations/',
  '/about/',
  '/apply/',
  '/pre-register/',
  '/submit-pre-interest/',
  '/submit-application/',
  '/404/',
  ...cities.map(([slug]) => `/locations/${slug}/`),
];

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
  assert.ok(contract.reserved_application_hosts.includes('admin-api.hhaus.org'));
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

test('public intake captures the contract and hands signed-in users to their server forms', () => {
  const preInterest = readRoute('/submit-pre-interest/');
  const preRegister = readRoute('/pre-register/');
  const application = readRoute('/submit-application/');
  for (const html of [preInterest, preRegister]) {
    for (const field of ['email', 'linkedin_url', 'entrepreneurship_idea', 'stay_preference', 'privacy_accepted']) {
      assert.match(html, new RegExp(`name="${field}"`));
    }
    assert.match(html, /https:\/\/user\.hhaus\.org\/submit-pre-interest/);
  }
  for (const field of ['linkedin_url', 'date_of_birth', 'resume', 'photo_id', 'age_and_identity_attestation']) {
    assert.match(application, new RegExp(`name="${field}"`));
  }
  assert.match(application, /https:\/\/user\.hhaus\.org\/submit-application/);
  assert.match(application, /Used only for age and identity verification/);
});

test('public intake client preserves the fail-closed dual-storage and upload boundary', () => {
  const client = read('public/intake.js');
  const scripts = read('src/components/PublicIntakeScripts.astro');
  assert.match(scripts, /api\.js\?render=explicit/);
  assert.match(client, /execution: 'execute'/);
  assert.match(client, /turnstile\.reset\(widgetId\)/);
  assert.match(client, /turnstile\.execute\(widgetId\)/);
  assert.match(client, /\/v1\/pre-interests/);
  assert.match(client, /\/v1\/applications/);
  assert.match(client, /\/v1\/intake\/uploads/);
  assert.match(client, /completed\.status !== 'verified'/);
  assert.match(client, /credentials: 'omit'/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|document\.cookie/);
  for (const marker of ['SERVICE_ROLE', 'SECRET_KEY', 'AUTH_SERVICE_CREDENTIAL']) {
    assert.equal(client.includes(marker), false);
  }
});
