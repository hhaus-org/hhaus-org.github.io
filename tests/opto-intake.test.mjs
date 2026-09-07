import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

test('vendored Opto Sync form connector exposes native and HTMX entry points', async () => {
  const connector = await import('../public/vendor/opto-sync-forms/index.js');
  assert.equal(connector.FORM_SCHEMA_VERSION, 'opto-sync.form.v1');
  assert.equal(typeof connector.createBrowserFormQueue, 'function');
  assert.equal(typeof connector.queueFormPayload, 'function');
  assert.equal(typeof connector.bindNativeForm, 'function');
  assert.equal(typeof connector.bindHtmxForm, 'function');
  assert.equal(typeof connector.BrowserFormQueue.prototype.deleteMutation, 'function');
});

test('intake queues a redacted form before the Rust API request', () => {
  const source = read('public/intake.js');
  assert.match(source, /from '\.\/vendor\/opto-sync-forms\/index\.js'/);
  const queueAt = source.indexOf('queued = await queueFormPayload');
  const apiAt = source.indexOf('const receipt = await apiPost', queueAt);
  assert.ok(queueAt >= 0 && apiAt > queueAt, 'the durable queue must precede transport');
  assert.match(source, /form_submissions\/hhaus\/pre-interest/);
  assert.match(source, /form_submissions\/hhaus\/application/);
  assert.match(source, /validateSubmissionReceipt/);
  assert.match(source, /receipt\.primaryPersistence !== 'stored'/);
  assert.match(source, /receipt\.supabasePersistence !== 'stored'/);
  assert.match(source, /retryPendingForm/);
  assert.match(source, /turnstileToken: await proofs\.fresh\(\)/);
  assert.match(source, /deleteMutation\(queued\.queueId\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
});

test('queued copies redact transport credentials and never include file bytes', async () => {
  const { sanitizeFormPayload } = await import('../public/vendor/opto-sync-forms/index.js');
  const sanitized = sanitizeFormPayload({
    email: 'resident@example.test',
    turnstileToken: 'transient',
    nested: { csrf_token: 'transient', city: 'Medellin' },
    resume: { name: 'resume.pdf', size: 10, type: 'application/pdf' },
  });
  assert.deepEqual(sanitized, {
    email: 'resident@example.test',
    nested: { city: 'Medellin' },
  });
});

test('Astro public assets include the complete pinned connector module graph', () => {
  for (const file of ['index.js', 'types.js', 'sanitize.js', 'browser-queue.js', 'connectors.js', 'LICENSE', 'UPSTREAM.md']) {
    assert.ok(existsSync(join(root, 'public/vendor/opto-sync-forms', file)), file);
  }
});
