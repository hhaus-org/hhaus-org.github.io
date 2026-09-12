import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeFormData } from '../public/vendor/opto-sync-forms/index.js';

// PR #5's FormData.forEach compatibility change is already in main through
// PR #7. Preserve that behavior while retaining the newer upstream module graph.
function baselineFormData() {
  const data = new FormData();
  for (const key of ['entries', 'keys', 'values', Symbol.iterator]) {
    Object.defineProperty(data, key, {
      get() { throw new Error('FormData iterator API must not be required'); },
    });
  }
  return data;
}

test('baseline FormData preserves repeated values and empty text in order', () => {
  const data = baselineFormData();
  data.append('city', 'Medellín');
  data.append('city', 'Montréal');
  data.append('city', '東京');
  data.append('notes', '');
  assert.deepEqual(serializeFormData(data), {
    fields: { city: ['Medellín', 'Montréal', '東京'], notes: '' },
  });
  assert.deepEqual(serializeFormData(baselineFormData()), { fields: {} });
});

test('baseline FormData removes normalized transient and custom field names', () => {
  const data = baselineFormData();
  data.append('city', 'Medellín');
  for (const key of ['CF-Turnstile-Response', 'csrf_token', 'Authorization', 'accessToken', 'custom-proof']) {
    data.append(key, 'synthetic-transport-only-value');
  }
  assert.deepEqual(serializeFormData(data, { transientFieldNames: ['CUSTOM_PROOF'] }), {
    fields: { city: 'Medellín' },
  });
  assert.equal(data.get('Authorization'), 'synthetic-transport-only-value', 'source data stays intact');
});

test('native file bytes are excluded by default and metadata is explicitly opt-in', () => {
  const data = baselineFormData();
  const contents = 'synthetic-file-content-must-never-enter-queue';
  const file = new File([contents], 'synthetic.txt', { type: 'text/plain', lastModified: 1000 });
  data.append('city', 'Medellín');
  data.append('attachment', file);
  data.append('attachment', file);
  data.append('empty', new File([], 'empty.txt'));
  data.append('access-token', file);
  assert.deepEqual(serializeFormData(data), { fields: { city: 'Medellín' } });
  const descriptor = { name: 'synthetic.txt', size: file.size, type: 'text/plain', lastModified: 1000 };
  const result = serializeFormData(data, { includeFileMetadata: true });
  assert.deepEqual(result, {
    fields: { city: 'Medellín' }, files: { attachment: [descriptor, descriptor] },
  });
  assert.ok(!JSON.stringify(result).includes(contents));
});
