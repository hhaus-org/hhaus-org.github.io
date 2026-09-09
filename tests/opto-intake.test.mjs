import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
const readBytes = (relativePath) => readFileSync(join(root, relativePath));
const vendor = 'public/vendor/opto-sync-forms';

function gitBlobSha(bytes) {
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex');
}

test('vendored Opto Sync form connector exposes native and HTMX entry points', async () => {
  const connector = await import('../public/vendor/opto-sync-forms/index.js');
  assert.equal(connector.FORM_SCHEMA_VERSION, 'opto-sync.form.v1');
  assert.equal(typeof connector.createBrowserFormQueue, 'function');
  assert.equal(typeof connector.queueFormPayload, 'function');
  assert.equal(typeof connector.bindNativeForm, 'function');
  assert.equal(typeof connector.bindHtmxForm, 'function');
  assert.equal(typeof connector.BrowserFormQueue.prototype.deleteMutation, 'function');
});

test('vendored module bytes match the documented merged upstream revision', () => {
  const upstream = read(`${vendor}/UPSTREAM.md`);
  assert.match(upstream, /2c2718ac9cfd236e10d73968d3ddada748900f4f/);
  const expected = {
    'types.js': 'a8d53d9c06e6f8f17c6fa5c03926a80eceef8055',
    'sanitize.js': '538e34ed9695da640a5590e831bc644f867f1843',
    'browser-queue.js': '95d7c1d3f8fe91f332ff0db394da4f352419f7f2',
    'connectors.js': 'f28ed44c96d659b7532857ab0d81180d46cc6978',
    'index.js': '603f1ac2f3cd5c860cf0d368d438a9cfe78c0bb9',
  };
  for (const [file, sha] of Object.entries(expected)) {
    assert.equal(gitBlobSha(readBytes(`${vendor}/${file}`)), sha, file);
    assert.ok(upstream.includes(`\`${file}\`: \`${sha}\``), `${file} provenance`);
  }
});

test('bootstrap installs Opto Sync before the existing intake client', () => {
  const bootstrap = read('public/intake-bootstrap.js');
  assert.ok(
    bootstrap.indexOf("import './intake-opto-sync.js'")
      < bootstrap.indexOf("import './intake.js'"),
  );
});

test('native intake fetches are durably queued before transport', () => {
  const source = read('public/intake-opto-sync.js');
  const snapshotAt = source.indexOf('const superseded = await supersededPending');
  const queueAt = source.indexOf('queued = await queueFormPayload');
  const cleanupAt = source.indexOf('await deleteSupersededPending', queueAt);
  const fetchAt = source.indexOf('response = await originalFetch', cleanupAt);

  assert.ok(snapshotAt >= 0, 'older durable copies must be inspected');
  assert.ok(queueAt > snapshotAt, 'the replacement must be written after inspecting older copies');
  assert.ok(
    cleanupAt > queueAt,
    'older copies must never be deleted until the replacement has committed',
  );
  assert.ok(fetchAt > cleanupAt, 'durable replacement and cleanup must precede transport');
  assert.doesNotMatch(
    source.slice(snapshotAt, queueAt),
    /deleteMutation/,
    'the last durable copy must not be deleted before replacement',
  );
  assert.match(source, /form_submissions\/hhaus\/pre-interest/);
  assert.match(source, /form_submissions\/hhaus\/application/);
  assert.match(source, /Ambiguous\/network failures remain pending/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
});

test('canonical receipt is bound to the exact queued submission and both stores', () => {
  const source = read('public/intake-opto-sync.js');
  assert.match(source, /receipt\.submissionId === expectedSubmissionId/);
  assert.match(source, /UUID_PATTERN\.test\(receipt\.submissionId\)/);
  assert.match(source, /receipt\.kind === expectedKind/);
  assert.match(source, /receipt\.primaryPersistence === 'stored'/);
  assert.match(source, /receipt\.supabasePersistence === 'stored'/);
  assert.match(source, /typeof receipt\.acceptedAt === 'string'/);
  assert.match(source, /invalidDualStorageReceipt|invalid_dual_storage_receipt/);
  assert.match(source, /deleteMutation\(queued\.queueId\)/);
});

test('request and response limits count UTF-8 bytes and bound streamed responses', () => {
  const source = read('public/intake-opto-sync.js');
  assert.match(source, /utf8ByteLength\(bodyText\) > MAX_INSPECTION_BYTES/);
  assert.match(source, /new TextEncoder\(\)\.encode\(value\)\.byteLength/);
  assert.match(source, /response\.body\.getReader\(\)/);
  assert.match(source, /total > maximumBytes/);
  assert.match(source, /new TextDecoder\('utf-8', \{ fatal: true \}\)/);
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

test('sanitizer rejects non-JSON and prototype-shaped values', async () => {
  const { sanitizeFormPayload } = await import('../public/vendor/opto-sync-forms/index.js');
  assert.throws(
    () => sanitizeFormPayload({ amount: Number.POSITIVE_INFINITY }),
    /finite/,
  );
  assert.throws(
    () => sanitizeFormPayload({ amount: 1n }),
    /BigInt/,
  );

  const source = JSON.parse('{"safe":"value","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
  assert.deepEqual(sanitizeFormPayload(source), { safe: 'value' });
  assert.equal({}.polluted, undefined);
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
    assert.ok(existsSync(join(root, vendor, file)), file);
  }
});
