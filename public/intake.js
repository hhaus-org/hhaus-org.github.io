const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const PRIVACY_NOTICE_VERSION = '2026-08-31';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class IntakeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntakeError';
  }
}

const form = document.querySelector('[data-intake-form]');
if (form) {
  initialize(form).catch(() => {
    setStatus('The public intake form could not start safely. Use the signed-in form or try again later.', 'error');
    disableSubmit(true);
  });
}

async function initialize(activeForm) {
  const apiOrigin = exactHttpsOrigin(activeForm.dataset.apiOrigin);
  const supabaseOrigin = exactHttpsOrigin(activeForm.dataset.supabaseOrigin ?? 'https://bihpugkzayenywfyajnr.supabase.co');
  const siteKey = activeForm.dataset.turnstileSiteKey?.trim() ?? '';
  if (!siteKey || siteKey.length > 256 || !/^[A-Za-z0-9_-]+$/.test(siteKey)) {
    throw new IntakeError('Public anti-automation verification is not configured.');
  }
  activeForm.elements.submission_nonce.value ||= crypto.randomUUID();
  const proofs = await createTurnstileProofBroker(siteKey);
  activeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeForm.reportValidity()) return;
    disableSubmit(true);
    setStatus('Verifying and securely submitting…', 'working');
    try {
      const kind = activeForm.dataset.intakeForm;
      const receipt = kind === 'pre-interest'
        ? await submitPreInterest(activeForm, apiOrigin, proofs)
        : await submitApplication(activeForm, apiOrigin, supabaseOrigin, proofs);
      if (!UUID_PATTERN.test(receipt.submissionId ?? '')) throw new IntakeError('The intake service returned an invalid receipt.');
      setStatus(`Received. Your dual-storage receipt is ${receipt.submissionId}.`, 'success');
      activeForm.querySelectorAll('input, textarea, select, button').forEach((control) => {
        control.disabled = true;
      });
    } catch (error) {
      const message = error instanceof IntakeError
        ? error.message
        : 'The submission could not be confirmed in both HHaus systems. Please retry.';
      setStatus(message, 'error');
      disableSubmit(false);
    }
  });
}

async function submitPreInterest(activeForm, apiOrigin, proofs) {
  const data = new FormData(activeForm);
  const nonce = canonicalNonce(data);
  return apiPost(apiOrigin, '/v1/pre-interests', `public-pre-interest:${nonce}`, {
    email: requiredString(data, 'email'),
    linkedinUrl: requiredString(data, 'linkedin_url'),
    entrepreneurshipIdea: requiredString(data, 'entrepreneurship_idea'),
    stayPreference: requiredString(data, 'stay_preference'),
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    turnstileToken: await proofs.fresh(),
  });
}

async function submitApplication(activeForm, apiOrigin, supabaseOrigin, proofs) {
  const data = new FormData(activeForm);
  const nonce = canonicalNonce(data);
  const resume = requiredFile(data, 'resume');
  const photoId = requiredFile(data, 'photo_id');
  await validateFile('resume', resume);
  await validateFile('photo_id', photoId);

  setStatus('Hashing and verifying your resume…', 'working');
  const resumeUploadId = await uploadFile({ apiOrigin, supabaseOrigin, proofs, nonce, kind: 'resume', file: resume });
  setStatus('Hashing and verifying your photo ID…', 'working');
  const photoIdUploadId = await uploadFile({ apiOrigin, supabaseOrigin, proofs, nonce, kind: 'photo_id', file: photoId });
  setStatus('Confirming both database copies…', 'working');

  const githubUrl = optionalString(data, 'github_url');
  const portfolioUrl = optionalString(data, 'portfolio_url');
  const accommodationNotes = optionalString(data, 'accessibility_or_accommodation_notes');
  const allergyNotes = optionalString(data, 'allergy_notes');
  const roomPreferenceNotes = optionalString(data, 'room_preference_notes');
  const preferredRoomOccupancy = Number(requiredString(data, 'preferred_room_occupancy'));
  if (!Number.isInteger(preferredRoomOccupancy) || preferredRoomOccupancy < 1 || preferredRoomOccupancy > 3) {
    throw new IntakeError('Preferred room occupancy must be between one and three.');
  }
  return apiPost(apiOrigin, '/v1/applications', `public-application:${nonce}:submit`, {
    email: requiredString(data, 'email'),
    linkedinUrl: requiredString(data, 'linkedin_url'),
    legalName: requiredString(data, 'legal_name'),
    dateOfBirth: requiredString(data, 'date_of_birth'),
    nationality: requiredString(data, 'nationality'),
    phone: requiredString(data, 'phone'),
    currentCity: requiredString(data, 'current_city'),
    ...(githubUrl ? { githubUrl } : {}),
    ...(portfolioUrl ? { portfolioUrl } : {}),
    entrepreneurshipIdea: requiredString(data, 'entrepreneurship_idea'),
    projectStage: requiredString(data, 'project_stage'),
    stayPreference: requiredString(data, 'stay_preference'),
    preferredStartMonth: `${requiredString(data, 'preferred_start_month')}-01`,
    communityContribution: requiredString(data, 'community_contribution'),
    ...(accommodationNotes ? { accessibilityOrAccommodationNotes: accommodationNotes } : {}),
    ...(allergyNotes ? { allergyNotes } : {}),
    noiseSensitivity: requiredString(data, 'noise_sensitivity'),
    lightSensitivity: requiredString(data, 'light_sensitivity'),
    ...(roomPreferenceNotes ? { roomPreferenceNotes } : {}),
    roommatePreference: requiredString(data, 'roommate_preference'),
    preferredRoomOccupancy,
    roommateForLowerCost: data.get('roommate_for_lower_cost') === 'on',
    roommateForSocialConnection: data.get('roommate_for_social_connection') === 'on',
    accommodationDataConsent: requiredCheckbox(data, 'accommodation_data_consent'),
    resumeUploadId,
    photoIdUploadId,
    ageAndIdentityAttestation: requiredCheckbox(data, 'age_and_identity_attestation'),
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    turnstileToken: await proofs.fresh(),
  });
}

async function uploadFile({ apiOrigin, supabaseOrigin, proofs, nonce, kind, file }) {
  const sha256 = await digestHex(file);
  const prefix = `public-application:${nonce}:${kind}`;
  const intent = await apiPost(apiOrigin, '/v1/intake/uploads', `${prefix}:intent`, {
    kind,
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    sha256,
    turnstileToken: await proofs.fresh(),
  });
  if (!UUID_PATTERN.test(intent.uploadId ?? '')) throw new IntakeError('The upload service returned an invalid receipt.');
  const uploadUrl = new URL(intent.uploadUrl);
  if (uploadUrl.origin !== supabaseOrigin || uploadUrl.protocol !== 'https:' || !uploadUrl.searchParams.has('token')) {
    throw new IntakeError('The private upload destination could not be verified.');
  }

  try {
    await fetch(uploadUrl, {
      method: 'PUT',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      headers: { 'content-type': file.type, 'x-upsert': 'false' },
      body: file,
    });
  } catch {
    // Completion is authoritative: the API streams and verifies the private
    // object before accepting it, including when browser upload status is ambiguous.
  }

  const completed = await apiPost(
    apiOrigin,
    `/v1/intake/uploads/${intent.uploadId}/complete`,
    `${prefix}:complete`,
    { sha256, turnstileToken: await proofs.fresh() },
  );
  if (completed.uploadId !== intent.uploadId || completed.status !== 'verified') {
    throw new IntakeError('The private upload could not be verified.');
  }
  return intent.uploadId;
}

async function apiPost(apiOrigin, path, idempotencyKey, body) {
  let response;
  try {
    response = await fetch(`${apiOrigin}${path}`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new IntakeError('The HHaus intake service is temporarily unreachable. Please retry.');
  }
  if (!response.ok) {
    if ([400, 409, 422].includes(response.status)) {
      throw new IntakeError('One or more fields were rejected, or this form nonce conflicts with an earlier submission.');
    }
    if (response.status === 401) {
      throw new IntakeError('This public request was not authorized. Refresh the page and try again.');
    }
    throw new IntakeError('HHaus could not confirm both database copies. Retry with the same information.');
  }
  const advertised = Number(response.headers.get('content-length') ?? 0);
  if (advertised > MAX_RESPONSE_BYTES) throw new IntakeError('The intake response was unexpectedly large.');
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new IntakeError('The intake response was unexpectedly large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new IntakeError('The intake service returned an invalid receipt.');
  }
}

async function createTurnstileProofBroker(sitekey) {
  const turnstile = await waitForTurnstile();
  let pending = null;
  let timeout = null;
  const widgetId = turnstile.render('#turnstile-widget', {
    sitekey,
    action: 'intake',
    execution: 'execute',
    appearance: 'interaction-only',
    callback(token) {
      if (!pending) return;
      const current = pending;
      pending = null;
      clearTimeout(timeout);
      if (!token || token.length > 2048) current.reject(new IntakeError('Anti-automation verification returned an invalid proof.'));
      else current.resolve(token);
    },
    'error-callback'() { rejectPending('Anti-automation verification failed. Please retry.'); },
    'expired-callback'() { rejectPending('Anti-automation verification expired. Please retry.'); },
    'timeout-callback'() { rejectPending('Anti-automation verification timed out. Please retry.'); },
  });

  function rejectPending(message) {
    if (!pending) return;
    const current = pending;
    pending = null;
    clearTimeout(timeout);
    current.reject(new IntakeError(message));
  }

  return {
    fresh() {
      if (pending) return Promise.reject(new IntakeError('Anti-automation verification is already running.'));
      turnstile.reset(widgetId);
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        timeout = setTimeout(() => rejectPending('Anti-automation verification timed out. Please retry.'), 120_000);
        try {
          turnstile.execute(widgetId);
        } catch {
          rejectPending('Anti-automation verification could not start. Please retry.');
        }
      });
    },
  };
}

function waitForTurnstile() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.turnstile) {
        clearInterval(timer);
        resolve(window.turnstile);
      } else if (Date.now() - started > 15_000) {
        clearInterval(timer);
        reject(new IntakeError('Anti-automation verification did not load.'));
      }
    }, 50);
  });
}

async function validateFile(kind, file) {
  if (!file.name || file.name.length > 255 || /[\\/\0]/.test(file.name) || file.size < 1 || file.size > MAX_FILE_BYTES) {
    throw new IntakeError(`${kind === 'resume' ? 'Resume' : 'Photo ID'} must be a supported file up to 10 MB.`);
  }
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (...bytes) => bytes.every((byte, index) => header[index] === byte);
  const ascii = new TextDecoder().decode(header);
  const valid =
    (file.type === 'application/pdf' && ascii.startsWith('%PDF-')) ||
    (kind === 'resume' && file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && starts(0x50, 0x4b, 0x03, 0x04)) ||
    (kind === 'photo_id' && file.type === 'image/jpeg' && starts(0xff, 0xd8, 0xff)) ||
    (kind === 'photo_id' && file.type === 'image/png' && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) ||
    (kind === 'photo_id' && file.type === 'image/heic' && ascii.slice(4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'mif1'].includes(ascii.slice(8, 12)));
  if (!valid) throw new IntakeError(`${kind === 'resume' ? 'Resume' : 'Photo ID'} content does not match its selected file type.`);
}

async function digestHex(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalNonce(data) {
  const nonce = requiredString(data, 'submission_nonce');
  if (!UUID_PATTERN.test(nonce)) throw new IntakeError('The form nonce is invalid. Refresh and try again.');
  return nonce;
}

function requiredString(data, name) {
  const value = data.get(name);
  if (typeof value !== 'string' || !value.trim()) throw new IntakeError(`Required field ${name} is missing.`);
  return value.trim();
}

function optionalString(data, name) {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function requiredFile(data, name) {
  const value = data.get(name);
  if (!(value instanceof File) || !value.name) throw new IntakeError(`Required file ${name} is missing.`);
  return value;
}

function requiredCheckbox(data, name) {
  if (data.get(name) !== 'on') throw new IntakeError(`Required consent ${name} is missing.`);
  return true;
}

function exactHttpsOrigin(value) {
  const parsed = new URL(value ?? '');
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new IntakeError('The intake service origin is invalid.');
  }
  return parsed.origin;
}

function setStatus(message, state) {
  const status = document.querySelector('#intake-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function disableSubmit(disabled) {
  const button = form?.querySelector('button[type="submit"]');
  if (button) button.disabled = disabled;
}
