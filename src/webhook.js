import net from 'node:net';

const MAX_ERROR_BODY_LENGTH = 500;
const DISCORD_MESSAGE_LIMIT = 2_000;

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

export async function postToWebhook({ url, payload, secret, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
      method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal, redirect: 'error',
    });
    const responseText = await response.text();
    if (!response.ok) {
      const suffix = responseText ? `: ${responseText.slice(0, MAX_ERROR_BODY_LENGTH)}` : '';
      throw new Error(`Webhook returned HTTP ${response.status}${suffix}`);
    }

    const contentType = response.headers.get('content-type');
    const data = parseJsonResponse(responseText, contentType);
    return {
      status: response.status,
      replies: extractReplies(responseText, contentType),
      route: typeof data?.route === 'string' ? data.route.trim().toLowerCase() : null,
      data,
    };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Webhook timed out after ${timeoutMs} ms.`);
    throw error;
  } finally {
    clearTimeout(timeout);
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

function isIgnorableWebhookBody(text) {
  const normalized = text.trim().toLowerCase();
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
