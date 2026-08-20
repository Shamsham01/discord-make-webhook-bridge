import { timingSafeEqual } from 'node:crypto';
import { resultFromWebhookBody } from './webhook.js';

const WEBHOOK_PATH = /^\/webhook\/([^/?#]+)\/?$/i;

export function createReplyRegistry({ publicBaseUrl, replySecret, maxBodyBytes = 1_000_000 } = {}) {
  const pending = new Map();
  const base = publicBaseUrl ? String(publicBaseUrl).replace(/\/$/, '') : null;

  function replyUrlForWorkflow(workflowName) {
    if (!base || !workflowName) return null;
    return `${base}/webhook/${encodeURIComponent(workflowName)}`;
  }

  function createWaiter({ messageId, workflow, timeoutMs }) {
    if (!messageId) return null;

    let settled = false;
    let resolvePromise;
    let rejectPromise;

    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const timer = setTimeout(() => {
      finish(() => {
        const error = new Error(`Timed out waiting for Make to POST the workflow reply to replyUrl after ${timeoutMs} ms.`);
        error.code = 'REPLY_TIMEOUT';
        rejectPromise(error);
      });
    }, timeoutMs);

    function finish(fn) {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      pending.delete(messageId);
      fn();
      return true;
    }

    const waiter = {
      messageId,
      workflow,
      replyUrl: replyUrlForWorkflow(workflow),
      promise,
      resolve(result) {
        finish(() => resolvePromise(result));
      },
      cancel() {
        finish(() => {
          const error = new Error('Reply wait cancelled.');
          error.code = 'REPLY_CANCELLED';
          rejectPromise(error);
        });
      },
    };

    pending.set(messageId, waiter);
    return waiter;
  }

  async function handleRequest(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1');
    const match = url.pathname.match(WEBHOOK_PATH);
    if (!match) return false;

    if (request.method !== 'POST' && request.method !== 'PUT') {
      response.writeHead(405, { allow: 'POST, PUT', 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
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

    const providedSecret = getProvidedSecret(request, url, body);
    if (replySecret && !secretsMatch(providedSecret, replySecret)) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'Invalid reply secret' }));
      return true;
    }

    const messageId = getMessageId(body);
    if (!messageId) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'messageId is required in the JSON body' }));
      return true;
    }

    const waiter = pending.get(messageId);
    if (!waiter) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'Unknown or expired messageId' }));
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
    replyUrlForWorkflow,
    get pendingCount() {
      return pending.size;
    },
  };
}

// Backwards-compatible export name used across the app.
export const createCallbackRegistry = createReplyRegistry;

function getMessageId(body) {
  const trimmed = String(body ?? '').trim();
  if (!trimmed.startsWith('{')) return '';
  try {
    const parsed = JSON.parse(trimmed);
    const value = parsed?.messageId ?? parsed?.message_id;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function getProvidedSecret(request, url, body) {
  const headerSecret = request.headers['x-reply-secret'] ?? request.headers['x-callback-token'];
  if (headerSecret) return String(headerSecret).trim();

  const authorization = String(request.headers.authorization ?? '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();

  const querySecret = url.searchParams.get('secret') || url.searchParams.get('token');
  if (querySecret) return querySecret.trim();

  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      for (const field of ['replySecret', 'secret', 'token', 'callbackToken']) {
        if (typeof parsed?.[field] === 'string') return parsed[field].trim();
      }
    } catch {
      return '';
    }
  }
  return '';
}

function secretsMatch(provided, expected) {
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
        reject(new Error('Reply body is too large.'));
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}
