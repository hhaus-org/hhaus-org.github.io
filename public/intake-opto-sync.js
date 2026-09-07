import {
  FORM_SCHEMA_VERSION,
  createBrowserFormQueue,
  queueFormPayload,
} from './vendor/opto-sync-forms/index.js';

const MAX_INSPECTION_BYTES = 256 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROUTES = Object.freeze({
  '/v1/pre-interests': Object.freeze({
    formName: 'hhaus.pre-interest',
    tableName: 'form_submissions/hhaus/pre-interest',
    receiptKind: 'pre_interest',
    keyPattern: /^public-pre-interest:([0-9a-f-]+)$/,
  }),
  '/v1/applications': Object.freeze({
    formName: 'hhaus.application',
    tableName: 'form_submissions/hhaus/application',
    receiptKind: 'application',
    keyPattern: /^public-application:([0-9a-f-]+):submit$/,
  }),
});

const activeForm = document.querySelector('[data-intake-form]');
if (activeForm) installOptoSyncFetchConnector(activeForm);

function installOptoSyncFetchConnector(form) {
  const apiOrigin = exactHttpsOrigin(form.dataset.apiOrigin);
  const originalFetch = globalThis.fetch.bind(globalThis);
  const queue = createBrowserFormQueue({
    databaseName: 'hhaus-public-intake-v1',
    maxPendingMutations: 50,
  });

  globalThis.fetch = async function optoSyncIntakeFetch(input, init) {
    const context = await intakeRequestContext(input, init, apiOrigin);
    if (!context) return originalFetch(input, init);

    let queued;
    try {
      await removeSupersededPending(queue, context.route.tableName, context.submissionId);
      queued = await queueFormPayload(queue, {
        formName: context.route.formName,
        tableName: context.route.tableName,
        submissionId: context.submissionId,
        sourceUrl: location.href,
        action: context.url.toString(),
        method: 'POST',
        payload: context.body,
      });
    } catch {
      throw new TypeError('The H/HAUS form could not be durably queued before transmission.');
    }

    let response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      // Ambiguous/network failures remain pending for an Opto Sync retry.
      throw error;
    }

    const inspection = await inspectResponse(response);
    if (response.ok) {
      if (!validDualStorageReceipt(inspection.body, context.route.receiptKind)) {
        return invalidReceiptResponse();
      }
      await queue.deleteMutation(queued.queueId).catch(() => undefined);
      return response;
    }

    const retryable = typeof inspection.body?.retryable === 'boolean'
      ? inspection.body.retryable
      : response.status >= 500 || [408, 425, 429].includes(response.status);
    if (!retryable) {
      await queue.deleteMutation(queued.queueId).catch(() => undefined);
    }
    return response;
  };

  form.dataset.optoSync = FORM_SCHEMA_VERSION;
  queue.pendingMutations().then((pending) => {
    form.dataset.optoPendingCount = String(pending.length);
    form.dispatchEvent(new CustomEvent('opto-sync:pending-forms', {
      bubbles: true,
      detail: { count: pending.length },
    }));
  }).catch(() => {
    form.dataset.optoPendingCount = 'unavailable';
  });
}

async function intakeRequestContext(input, init, apiOrigin) {
  const request = input instanceof Request ? input : null;
  const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
  if (method !== 'POST') return null;

  const rawUrl = request?.url ?? (input instanceof URL ? input.href : String(input));
  const url = new URL(rawUrl, location.href);
  if (
    url.origin !== apiOrigin
    || url.search
    || url.hash
    || !Object.hasOwn(ROUTES, url.pathname)
  ) return null;

  const headers = new Headers(request?.headers);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  }
  if (headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return null;
  }
  const idempotencyKey = headers.get('idempotency-key')?.trim() ?? '';
  const route = ROUTES[url.pathname];
  const keyMatch = route.keyPattern.exec(idempotencyKey);
  if (!keyMatch || !UUID_PATTERN.test(keyMatch[1])) return null;

  const bodyText = await requestBodyText(request, init);
  if (bodyText.length > MAX_INSPECTION_BYTES) {
    throw new TypeError('The H/HAUS form payload is too large to queue safely.');
  }
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new TypeError('The H/HAUS form payload is not valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('The H/HAUS form payload must be a JSON object.');
  }
  return { url, route, submissionId: keyMatch[1], body };
}

async function requestBodyText(request, init) {
  if (typeof init?.body === 'string') return init.body;
  if (init?.body instanceof Blob) return init.body.text();
  if (init?.body instanceof URLSearchParams) return init.body.toString();
  if (request && init?.body === undefined) return request.clone().text();
  throw new TypeError('The H/HAUS form request body cannot be queued safely.');
}

async function removeSupersededPending(queue, tableName, submissionId) {
  const pending = await queue.pendingMutations(tableName);
  for (const mutation of pending) {
    if (mutation.recordId === submissionId && Number.isSafeInteger(mutation.id)) {
      await queue.deleteMutation(mutation.id);
    }
  }
}

async function inspectResponse(response) {
  let clone;
  try {
    clone = response.clone();
  } catch {
    return { body: null };
  }
  const advertised = Number(clone.headers.get('content-length') ?? 0);
  if (advertised > MAX_INSPECTION_BYTES) return { body: null };
  let text;
  try {
    text = await clone.text();
  } catch {
    return { body: null };
  }
  if (text.length > MAX_INSPECTION_BYTES) return { body: null };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { body: null };
  }
}

function validDualStorageReceipt(receipt, expectedKind) {
  return Boolean(
    receipt
    && UUID_PATTERN.test(receipt.submissionId ?? '')
    && receipt.kind === expectedKind
    && receipt.primaryPersistence === 'stored'
    && receipt.supabasePersistence === 'stored'
    && !Number.isNaN(Date.parse(receipt.acceptedAt ?? ''))
  );
}

function invalidReceiptResponse() {
  return new Response(JSON.stringify({
    code: 'invalid_dual_storage_receipt',
    message: 'The intake service did not return a complete dual-storage receipt.',
    retryable: true,
  }), {
    status: 502,
    headers: { 'content-type': 'application/json' },
  });
}

function exactHttpsOrigin(value) {
  const parsed = new URL(value ?? '');
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new TypeError('The H/HAUS intake API origin is invalid.');
  }
  return parsed.origin;
}
