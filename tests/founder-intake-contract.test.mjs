import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const applicationForm = read('src/components/ApplicationForm.astro');
const intakeClient = read('public/intake.js');
const intakeRoute = read('src/pages/forms/intake/index.astro');

test('founder intake captures idea, audience, market size, and cross-pollination', () => {
  for (const field of [
    'entrepreneurship_idea',
    'target_audience',
    'total_market_size',
    'cross_pollination_value',
  ]) {
    assert.match(applicationForm, new RegExp(`name="${field}"`));
  }
  assert.match(applicationForm, /who uses the product, and who pays/i);
  assert.match(applicationForm, /total addressable market/i);
  assert.match(applicationForm, /expertise, feedback, introductions, collaborations/i);
});

test('browser serializer sends all founder fields through the existing application endpoint', () => {
  assert.match(intakeClient, /\/v1\/applications/);
  assert.match(intakeClient, /targetAudience: requiredString\(data, 'target_audience'\)/);
  assert.match(intakeClient, /totalMarketSize: requiredString\(data, 'total_market_size'\)/);
  assert.match(intakeClient, /crossPollinationValue: requiredString\(data, 'cross_pollination_value'\)/);
  assert.match(intakeClient, /idempotency-key/);
  assert.doesNotMatch(intakeClient, /service_role|SUPABASE_SERVICE|NEON_DATABASE_URL/i);
});

test('/forms/intake is the stable public founder-intake entry point', () => {
  assert.match(intakeRoute, /ApplicationForm/);
  assert.match(intakeRoute, /PublicIntakeScripts/);
  assert.match(intakeRoute, /https:\/\/user\.hhaus\.org\/forms\/intake/);
});
