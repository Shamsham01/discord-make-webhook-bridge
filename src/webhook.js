import net from 'node:net';
import { Agent } from 'undici';

const MAX_ERROR_BODY_LENGTH = 500;
const DISCORD_MESSAGE_LIMIT = 2_000;
export const MAKE_HOLD_TIMEOUT_HINT_MS = 8_000;

export function validateWebhookUrl(rawUrl, allowedHosts) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('The webhook URL is not valid.');
  }
  if (url.protocol !== 'https:') throw new Error('The webhook URL must use HTTPS.');
  if (url.username || url.password) throw new Error('Webhook URLs containing usernames or passwords are not allowed.');

  const hostname = url.hostname.toLowerCase();
  const ipCandidate = hostname.replace(/^\[|\]$/g, '');
  if (!isHostAllowed(hostname, allowedHosts)) {
    throw new Error(`Webhook host “${hostname}” is not permitted by ALLOWED_WEBHOOK_HOSTS.`);
  }
  if (isPrivateIpLiteral(ipCandidate)) throw new Error('Private, loopback, and link-local IP addresses are not allowed.');
  return url.toString();
}

export function isHostAllowed(hostname, patterns) {
  if (patterns.includes('*')) return true;
  return patterns.some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1);
      return hostname.endsWith(suffix) && hostname.length > suffix.length;
    }
    return hostname === pattern;
  });
}

function isPrivateIpLiteral(hostname) {
  const version = net.isIP(hostname);
  if (version === 0) return false;
  if (version === 4) {
    const [a, b] = hostname.split('.').map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
  }
  const normalized = hostname.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized);
}

export function isAbortError(error) {
  if (!error) return false;
  if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return true;
  return isAbortError(error.cause);
}

export async function postToWebhook({ url, payload, secret, timeoutMs, signal }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const dispatcher = new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    connectTimeout: Math.min(30_000, timeoutMs),
  });

  try {
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'discord-make-webhook-bridge/2.0',
      'x-discord-event': payload.event,
      'x-discord-guild-id': payload.guildId,
      'x-discord-message-id': payload.messageId,
    };
    if (secret) headers['x-discord-bridge-secret'] = secret;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'error',
      dispatcher,
    });
    const responseText = await response.text();
    if (!response.ok) {
      const suffix = responseText ? `: ${responseText.slice(0, MAX_ERROR_BODY_LENGTH)}` : '';
      throw new Error(`Webhook returned HTTP ${response.status}${suffix}`);
    }

    const contentType = response.headers.get('content-type');
    return resultFromWebhookBody({ status: response.status, body: responseText, contentType });
  } catch (error) {
    if (isAbortError(error)) {
      if (signal?.aborted) {
        const cancelled = new Error('Webhook request was cancelled.');
        cancelled.code = 'WEBHOOK_CANCELLED';
        throw cancelled;
      }
      throw new Error(`Webhook timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);
    dispatcher.close();
  }
}

export function resultFromWebhookBody({ status, body, contentType = '' }) {
  const responseText = String(body ?? '');
  const data = parseJsonResponse(responseText, contentType);
  return {
    status,
    body: responseText,
    replies: extractReplies(responseText, contentType),
    route: typeof data?.route === 'string' ? data.route.trim().toLowerCase() : null,
    data,
  };
}

export function isPlaceholderWebhookResult(result) {
  if (result?.replies?.length) return false;
  return isIgnorableWebhookBody(result?.body ?? '');
}

export function isLikelyMakeHoldTimeout(result, elapsedMs, hintMs = MAKE_HOLD_TIMEOUT_HINT_MS) {
  return isPlaceholderWebhookResult(result) && elapsedMs >= hintMs;
}

export function createMakeHoldTimeoutError({ elapsedMs, timeoutMs, hasCallbackUrl, body }) {
  const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));
  const waitSec = Math.max(1, Math.round(timeoutMs / 1000));
  const bodyHint = summarizeWebhookBody(body);
  const error = new Error(
    hasCallbackUrl
      ? `Make closed the webhook after ${elapsedSec}s with no reply text${bodyHint}. The bot kept waiting until ${waitSec}s for Make to POST the Agent output to callbackUrl. Add an HTTP module at the end of the scenario that POSTs the Agent response to callbackUrl, with header x-callback-token set to callbackToken.`
      : `Make closed the webhook after ${elapsedSec}s with no reply text${bodyHint}. Make does not keep custom webhooks open for long-running Agents, so raising WEBHOOK_TIMEOUT_MS cannot extend that hold. Set PUBLIC_BASE_URL on the bot, then add an HTTP module at the end of the Make scenario that POSTs the Agent response to callbackUrl with header x-callback-token.`,
  );
  error.code = 'MAKE_HOLD_TIMEOUT';
  return error;
}

function summarizeWebhookBody(body) {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return '';
  const preview = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
  return ` (body: ${JSON.stringify(preview)})`;
}

export async function invokeMakeWebhook({
  url,
  payload,
  secret,
  timeoutMs,
  callbacks,
  holdTimeoutHintMs = MAKE_HOLD_TIMEOUT_HINT_MS,
}) {
  const waiter = callbacks?.createWaiter?.(timeoutMs) ?? null;
  const outbound = { ...payload };
  if (waiter?.callbackUrl) {
    outbound.callbackUrl = waiter.callbackUrl;
    outbound.callbackToken = waiter.token;
  }

  const fetchAbort = new AbortController();
  const startedAt = Date.now();
  const webhookPromise = postToWebhook({
    url,
    payload: outbound,
    secret,
    timeoutMs,
    signal: fetchAbort.signal,
  }).then((result) => ({ type: 'webhook', result }))
    .catch((error) => ({ type: 'webhook', error }));

  const callbackPromise = waiter
    ? waiter.promise
        .then((result) => ({ type: 'callback', result }))
        .catch((error) => ({ type: 'callback', error }))
    : null;

  try {
    const first = callbackPromise
      ? await Promise.race([webhookPromise, callbackPromise])
      : await webhookPromise;

    if (first.type === 'callback') {
      if (first.error) {
        if (first.error.code === 'CALLBACK_TIMEOUT') {
          const webhookOutcome = await webhookPromise;
          if (webhookOutcome.result?.replies?.length) return webhookOutcome.result;
          if (webhookOutcome.error) throw webhookOutcome.error;
          throw createMakeHoldTimeoutError({
            elapsedMs: Date.now() - startedAt,
            timeoutMs,
            hasCallbackUrl: Boolean(waiter?.callbackUrl),
            body: webhookOutcome.result?.body,
          });
        }
        if (first.error.code === 'CALLBACK_CANCELLED') {
          const webhookOutcome = await webhookPromise;
          if (webhookOutcome.error) throw webhookOutcome.error;
          return webhookOutcome.result;
        }
        throw first.error;
      }
      fetchAbort.abort();
      return first.result;
    }

    if (first.error) throw first.error;

    if (first.result.replies.length) {
      waiter?.cancel();
      return first.result;
    }

    const elapsedMs = Date.now() - startedAt;
    if (!isLikelyMakeHoldTimeout(first.result, elapsedMs, holdTimeoutHintMs)) {
      waiter?.cancel();
      return first.result;
    }

    if (!waiter?.callbackUrl) {
      throw createMakeHoldTimeoutError({
        elapsedMs,
        timeoutMs,
        hasCallbackUrl: false,
        body: first.result.body,
      });
    }

    console.warn(
      `[webhook] Make returned HTTP ${first.result.status} without reply text after ${elapsedMs} ms${summarizeWebhookBody(first.result.body)}. Waiting for callback until ${timeoutMs} ms.`,
    );

    const later = await callbackPromise;
    if (later.error) {
      if (later.error.code === 'CALLBACK_TIMEOUT' || later.error.code === 'CALLBACK_CANCELLED') {
        throw createMakeHoldTimeoutError({
          elapsedMs: Date.now() - startedAt,
          timeoutMs,
          hasCallbackUrl: Boolean(waiter?.callbackUrl),
          body: first.result.body,
        });
      }
      throw later.error;
    }
    return later.result;
  } finally {
    waiter?.cancel();
    if (!fetchAbort.signal.aborted) fetchAbort.abort();
  }
}

function parseJsonResponse(responseText, contentType = '') {
  if (!responseText) return null;

  const normalizedContentType = String(contentType ?? '').toLowerCase();
  const trimmedResponse = responseText.trim();
  const looksLikeJson = trimmedResponse.startsWith('{') || trimmedResponse.startsWith('[') || trimmedResponse.startsWith('"');

  // Make can return a valid JSON body without a Content-Type header.
  if (!normalizedContentType.includes('application/json') && !looksLikeJson) return null;

  try { return JSON.parse(trimmedResponse); } catch { return null; }
}

export function isIgnorableWebhookBody(text) {
  const normalized = String(text ?? '').trim().toLowerCase();
  return !normalized || normalized === 'accepted' || normalized === '"accepted"';
}

export function extractReplies(responseText, contentType = '') {
  const trimmed = String(responseText ?? '').trim();
  if (isIgnorableWebhookBody(trimmed)) return [];

  const parsed = parseJsonResponse(trimmed, contentType);

  if (typeof parsed === 'string') {
    const value = parsed.trim();
    return value && !isIgnorableWebhookBody(value) ? splitDiscordMessage(value) : [];
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const fromFields = extractRepliesFromData(parsed);
    if (fromFields.length) return fromFields;
    // Valid JSON object without reply fields — do not dump it as chat text.
    return [];
  }

  if (Array.isArray(parsed)) {
    const strings = parsed.filter((value) => typeof value === 'string' && value.trim());
    if (strings.length) return strings.flatMap((value) => splitDiscordMessage(value.trim()));
    return [];
  }

  // Plain multi-line text bodies from Make (e.g. map AI Agent "Response" directly).
  return splitDiscordMessage(trimmed);
}

function extractRepliesFromData(parsed) {
  const candidates = [];
  if (typeof parsed?.reply === 'string') candidates.push(parsed.reply);
  if (typeof parsed?.content === 'string') candidates.push(parsed.content);
  if (Array.isArray(parsed?.replies)) candidates.push(...parsed.replies);
  if (Array.isArray(parsed?.messages)) candidates.push(...parsed.messages);
  return candidates.filter((value) => typeof value === 'string' && value.trim()).flatMap((value) => splitDiscordMessage(value.trim()));
}

export function splitDiscordMessage(text, limit = DISCORD_MESSAGE_LIMIT) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf('\n\n', limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = remaining.lastIndexOf(' ', limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = limit;
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
