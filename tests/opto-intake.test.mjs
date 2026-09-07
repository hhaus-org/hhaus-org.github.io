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

test('bootstrap installs Opto Sync before the existing intake client', () => {
  const bootstrap = read('public/intake-bootstrap.js');
  assert.ok(
    bootstrap.indexOf("import './intake-opto-sync.js'")
      < bootstrap.indexOf("import './intake.js'"),
  );
});

test('native intake fetches are queued before transport and require dual-storage receipts', () => {
  const source = read('public/intake-opto-sync.js');
  const queueAt = source.indexOf('queued = await queueFormPayload');
  const fetchAt = source.indexOf('response = await originalFetch', queueAt);
  assert.ok(queueAt >= 0 && fetchAt > queueAt, 'the durable queue must precede transport');
  assert.match(source, /form_submissions\/hhaus\/pre-interest/);
  assert.match(source, /form_submissions\/hhaus\/application/);
  assert.match(source, /receipt\.primaryPersistence === 'stored'/);
  assert.match(source, /receipt\.supabasePersistence === 'stored'/);
  assert.match(source, /invalidDualStorageReceipt|invalid_dual_storage_receipt/);
  assert.match(source, /deleteMutation\(queued\.queueId\)/);
  assert.match(source, /Ambiguous\/network failures remain pending/);
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
  for (const file of [
    'index.js',
    'types.js',
    'sanitize.js',
    'browser-queue.js',
    'connectors.js',
    'LICENSE',
    'UPSTREAM.md',
  ]) {
    assert.ok(existsSync(join(root, 'public/vendor/opto-sync-forms', file)), file);
  }
});
