import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resultFromWebhookBody } from './webhook.js';

const UUID_PATH = /^\/callbacks\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function createCallbackRegistry({ publicBaseUrl, maxBodyBytes = 1_000_000 } = {}) {
  const pending = new Map();
  const base = publicBaseUrl ? String(publicBaseUrl).replace(/\/$/, '') : null;

  function createWaiter(timeoutMs) {
    const id = randomUUID();
    const token = randomBytes(24).toString('hex');
    let settled = false;
    let resolvePromise;
    let rejectPromise;

    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const timer = setTimeout(() => {
      finish(() => {
        const error = new Error(`Timed out waiting for Make to POST the workflow reply to callbackUrl after ${timeoutMs} ms.`);
        error.code = 'CALLBACK_TIMEOUT';
        rejectPromise(error);
      });
    }, timeoutMs);

    function finish(fn) {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      pending.delete(id);
      fn();
      return true;
    }

    const waiter = {
      id,
      token,
      callbackUrl: base ? `${base}/callbacks/${id}` : null,
      promise,
      resolve(result) {
        finish(() => resolvePromise(result));
      },
      cancel() {
        finish(() => {
          const error = new Error('Callback wait cancelled.');
          error.code = 'CALLBACK_CANCELLED';
          rejectPromise(error);
        });
      },
    };

    pending.set(id, waiter);
    return waiter;
  }

  async function handleRequest(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1');
    const match = url.pathname.match(UUID_PATH);
    if (!match) return false;

    if (request.method !== 'POST' && request.method !== 'PUT') {
      response.writeHead(405, { allow: 'POST, PUT', 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return true;
    }

    const waiter = pending.get(match[1].toLowerCase());
    if (!waiter) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'Unknown or expired callback' }));
      return true;
    }

    let body;
    try {
      body = await readRequestBody(request, maxBodyBytes);
    } catch (error) {
      response.writeHead(413, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: error.message }));
      return true;
    }

    const providedToken = getProvidedToken(request, url, body);
    if (!tokensMatch(providedToken, waiter.token)) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'Invalid callback token' }));
      return true;
    }

    const contentType = String(request.headers['content-type'] ?? '');
    waiter.resolve(resultFromWebhookBody({ status: 200, body, contentType }));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
    return true;
  }

  return {
    createWaiter,
    handleRequest,
    get pendingCount() {
      return pending.size;
    },
  };
}

function getProvidedToken(request, url, body) {
  const headerToken = request.headers['x-callback-token'];
  if (headerToken) return String(headerToken).trim();

  const authorization = String(request.headers.authorization ?? '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();

  const queryToken = url.searchParams.get('token') || url.searchParams.get('callbackToken');
  if (queryToken) return queryToken.trim();

  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed?.callbackToken === 'string') return parsed.callbackToken.trim();
      if (typeof parsed?.token === 'string') return parsed.token.trim();
    } catch {
      return '';
    }
  }
  return '';
}

function tokensMatch(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(String(provided));
  const right = Buffer.from(String(expected));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readRequestBody(request, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        request.destroy();
        reject(new Error('Callback body is too large.'));
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}
